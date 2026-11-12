-- Dragons Kasse – Supabase-Schema
-- Jede Sammlung ist eine Tabelle (id text, data jsonb). Zugriff regeln Row-Level-Security-Policies.
--   member      : angemeldet + vom Admin freigeschaltet → darf alles lesen, eigene Zahlung melden
--   kassenwart  : wie member + Strafen/Rechnungen eintragen + Zahltag starten (nur er)
--   admin       : wie member + Strafen/Rechnungen eintragen + Katalog, Kader, Zahlungsdaten, Mitglieder verwalten

-- ---------- Mitglieder ----------
create table if not exists public.members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  player_id  text,
  role       text not null default 'member',
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Rollen: member (Spieler), kassenwart, admin, deckenzaehler (wie Spieler, nur mit eigenem Namen)
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.members'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%role%' loop
    execute format('alter table public.members drop constraint %I', c);
  end loop;
  alter table public.members add constraint members_role_check check (role in ('member','kassenwart','admin','deckenzaehler'));
end $$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select case when approved then role end from public.members where user_id = auth.uid()
$$;
create or replace function public.is_member() returns boolean language sql stable security definer set search_path = public as $$ select public.my_role() is not null $$;
create or replace function public.is_admin()  returns boolean language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() = 'admin', false) $$;
create or replace function public.is_kw()     returns boolean language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() = 'kassenwart', false) $$;
-- Wichtig: nie NULL zurückgeben. Ohne Rolle wäre `not can_book()` sonst NULL und eine Prüfung `if not can_book()` liefe ins Leere.
create or replace function public.can_book()  returns boolean language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() in ('admin','kassenwart'), false) $$;

alter table public.members enable row level security;
drop policy if exists members_read on public.members;
create policy members_read on public.members for select using (user_id = auth.uid() or public.is_member());
drop policy if exists members_signup on public.members;
create policy members_signup on public.members for insert
  with check (user_id = auth.uid() and role = 'member' and approved = false);
drop policy if exists members_admin_update on public.members;
-- Rollen verwalten: Admin darf alles. Der Kassenwart darf Mitglieder freischalten/sperren und die Rollen member/deckenzaehler
-- vergeben, aber niemanden zum Admin oder Kassenwart machen und Admins/Kassenwarte weder ändern noch entfernen.
create policy members_admin_update on public.members for update
  using (public.is_admin() or (public.is_kw() and role in ('member','deckenzaehler')))
  with check (public.is_admin() or (public.is_kw() and role in ('member','deckenzaehler')));
drop policy if exists members_admin_delete on public.members;
create policy members_admin_delete on public.members for delete
  using (public.is_admin() or (public.is_kw() and role in ('member','deckenzaehler')) or (user_id = auth.uid() and approved = false));

-- ---------- Dokument-Tabellen ----------
do $$
declare t text;
begin
  foreach t in array array['players','fines','entries','bills','settings','zahltag','fees'] loop
    execute format('create table if not exists public.%I (id text primary key, data jsonb not null default ''{}'', updated_at timestamptz not null default now())', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select using (public.is_member())', t||'_read', t);
  end loop;
  -- Kader (Name, Nummer, Foto) dürfen auch noch nicht freigeschaltete Konten sehen, um sich zuzuordnen
  drop policy if exists players_read on public.players;
  create policy players_read on public.players for select using (auth.uid() is not null);
end $$;

-- Schreibrechte
do $$
declare t text; cond text;
begin
  foreach t in array array['players','fines','entries','bills','settings','zahltag','fees'] loop
    cond := case t
      when 'zahltag'  then 'public.can_book()'     -- Kassenwart und Admin
      else                 'public.can_book()'      -- alles andere: Kassenwart + Admin
    end;
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format('create policy %I on public.%I for insert with check (%s)', t||'_ins', t, cond);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)', t||'_upd', t, cond, cond);
    execute format('create policy %I on public.%I for delete using (%s)', t||'_del', t, cond);
  end loop;
end $$;

-- Deckenzähler: darf NUR „Fußball an der Decke“ (fineId f26) für andere eintragen und eigene, unbezahlte Einträge zurücknehmen
create or replace function public.is_decke() returns boolean language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() = 'deckenzaehler', false) $$;
drop policy if exists entries_decke_ins on public.entries;
create policy entries_decke_ins on public.entries for insert with check (
  public.is_decke() and data->>'fineId' = 'f26' and data->>'createdBy' = auth.uid()::text
  and not coalesce((data->>'paid')::boolean, false) and not coalesce((data->>'kabinenfest')::boolean, false)
  and (data->>'amount')::numeric between 0 and 50);
drop policy if exists entries_decke_upd on public.entries;
create policy entries_decke_upd on public.entries for update
  using (public.is_decke() and data->>'fineId' = 'f26' and data->>'createdBy' = auth.uid()::text and not coalesce((data->>'paid')::boolean, false))
  with check (public.is_decke() and data->>'fineId' = 'f26' and data->>'createdBy' = auth.uid()::text and not coalesce((data->>'paid')::boolean, false)
  and (data->>'amount')::numeric between 0 and 50);
drop policy if exists entries_decke_del on public.entries;
create policy entries_decke_del on public.entries for delete
  using (public.is_decke() and data->>'fineId' = 'f26' and data->>'createdBy' = auth.uid()::text and not coalesce((data->>'paid')::boolean, false));

-- Teil-Update eines Dokuments (RLS gilt, weil security invoker)
create or replace function public.doc_patch(t text, doc_id text, patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if t not in ('players','fines','entries','bills','settings','zahltag','receipts') then raise exception 'unknown table'; end if;
  execute format('update public.%I set data = data || $1, updated_at = now() where id = $2', t) using patch, doc_id;
end $$;

-- „Ich habe bezahlt“: meldet NUR die eigenen offenen Einträge als bezahlt. Der Kassenwart bestätigt oder lehnt ab.
create or replace function public.report_self_paid() returns int
language plpgsql security definer set search_path = public as $$
declare pid text; n int;
begin
  select player_id into pid from public.members where user_id = auth.uid() and approved;
  if pid is null then raise exception 'Kein verknüpfter Spieler'; end if;
  update public.entries
     set data = data || jsonb_build_object('reported', true,
           'reportedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'reportedBy', auth.uid()),
         updated_at = now()
   where data->>'playerId' = pid
     and not coalesce((data->>'paid')::boolean, false)
     and not coalesce((data->>'reported')::boolean, false);
  get diagnostics n = row_count;
  return n;
end $$;

-- Meldung zurücknehmen (nur eigene, noch nicht bestätigte Einträge)
create or replace function public.undo_self_report() returns int
language plpgsql security definer set search_path = public as $$
declare pid text; n int;
begin
  select player_id into pid from public.members where user_id = auth.uid() and approved;
  if pid is null then raise exception 'Kein verknüpfter Spieler'; end if;
  update public.entries
     set data = (data - 'reported' - 'reportedAt' - 'reportedBy'), updated_at = now()
   where data->>'playerId' = pid
     and not coalesce((data->>'paid')::boolean, false)
     and coalesce((data->>'reported')::boolean, false);
  get diagnostics n = row_count;
  return n;
end $$;
drop function if exists public.mark_self_paid();

-- Automatische Verzugsstrafe nach Ablauf eines Zahltags (idempotent)
create or replace function public.apply_late_fees() returns int
language plpgsql security definer set search_path = public as $$
declare z record; pid text; n int := 0; fee numeric := 10;
begin
  for z in
    select * from public.zahltag
     where coalesce((data->>'active')::boolean, false)
       and (data->>'endsAt')::timestamptz <= now()
       and not coalesce((data->>'penaltiesApplied')::boolean, false)
     for update skip locked
  loop
    for pid in select jsonb_object_keys(coalesce(z.data->'due', '{}'::jsonb)) loop
      if exists (
        select 1 from public.entries e
         where e.id in (select jsonb_array_elements_text(coalesce(z.data->'entryIds', '[]'::jsonb)))
           and e.data->>'playerId' = pid
           and not coalesce((e.data->>'paid')::boolean, false)
      ) then
        insert into public.entries (id, data) values (
          'verzug-' || z.id || '-' || pid,
          jsonb_build_object('playerId', pid, 'fineId', 'f70', 'col', 'strafen', 'title', 'Zahlungsverzug nach Zahltag',
            'amount', fee, 'kabinenfest', false, 'kfDone', false,
            'note', 'Zahltag bis ' || to_char((z.data->>'endsAt')::timestamptz at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI') || ' nicht bezahlt',
            'date', to_char((z.data->>'endsAt')::timestamptz at time zone 'Europe/Berlin', 'YYYY-MM-DD'),
            'createdAt', now(), 'paid', false, 'auto', true))
        on conflict (id) do nothing;
        n := n + 1;
      end if;
    end loop;
    update public.zahltag set data = data || jsonb_build_object('penaltiesApplied', true, 'penaltiesCount', n), updated_at = now() where id = z.id;
  end loop;
  return n;
end $$;

grant execute on function public.doc_patch(text, text, jsonb), public.report_self_paid(), public.undo_self_report(), public.apply_late_fees() to authenticated;
revoke execute on function public.report_self_paid(), public.undo_self_report(), public.apply_late_fees(), public.doc_patch(text, text, jsonb) from public, anon;

-- Monatsbeitrag wird NICHT mehr automatisch eingetragen (Kassenwart trägt ihn per „Monatsbeitrag“ → „Alle auswählen“ ein).
-- Die Tabellen fees und fee_log bleiben mit ihren Daten erhalten; die alte Automatik wird entfernt.
create table if not exists public.fee_log (id text primary key, created_at timestamptz not null default now());
alter table public.fee_log enable row level security;
drop function if exists public.ensure_monthly_fees();

-- Live-Updates
do $$
declare t text;
begin
  foreach t in array array['players','fines','entries','bills','settings','zahltag','fees','members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- Belege (Fotos von Rechnungen) ----------
-- Jedes freigeschaltete Mitglied darf ein Foto hochladen. Ansehen dürfen alle Mitglieder,
-- Verbuchen/Löschen der Kassenwart und Admins (der Hochlader darf seinen noch nicht verbuchten Beleg löschen).
create table if not exists public.receipts (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now());
alter table public.receipts enable row level security;
drop policy if exists receipts_read on public.receipts;
create policy receipts_read on public.receipts for select using (public.is_member());
drop policy if exists receipts_ins on public.receipts;
create policy receipts_ins on public.receipts for insert with check (
  public.is_member() and data->>'uid' = auth.uid()::text and coalesce(data->>'status','neu') = 'neu'
  -- ein Beleg darf nur im eigenen Namen eingereicht werden (sonst könnte jemand als anderer Spieler „ausgelegt“ haben)
  and data->>'playerId' is not distinct from (select player_id from public.members where user_id = auth.uid()));
drop policy if exists receipts_upd on public.receipts;
create policy receipts_upd on public.receipts for update using (public.can_book()) with check (public.can_book());
drop policy if exists receipts_del on public.receipts;
create policy receipts_del on public.receipts for delete using (public.can_book() or (data->>'uid' = auth.uid()::text and coalesce(data->>'status','neu') = 'neu'));

-- privater Speicher-Bucket (max. 5 MB, nur Bilder); Pfad immer <user-id>/<datei>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('belege', 'belege', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists belege_read on storage.objects;
create policy belege_read on storage.objects for select using (bucket_id = 'belege' and public.is_member());
drop policy if exists belege_ins on storage.objects;
create policy belege_ins on storage.objects for insert with check (bucket_id = 'belege' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists belege_del on storage.objects;
create policy belege_del on storage.objects for delete using (bucket_id = 'belege' and (public.can_book() or (storage.foldername(name))[1] = auth.uid()::text));

-- Live-Updates für Belege (erst nach dem Anlegen der Tabelle)
do $$
begin
  alter publication supabase_realtime add table public.receipts;
exception when duplicate_object then null;
end $$;

-- ---------- Guthaben mit Strafen verrechnen ----------
-- Guthaben einer Person = ausgelegte Rechnungen/Gutschriften (bills.paidBy), noch nicht erstattet,
-- minus der Teil, der schon verrechnet wurde (bills.credited).
-- Verrechnet wird NUR beim Start eines Zahltags (apply_credit_all) und wenn der Kassenwart eine Zahlung bucht
-- (pay_entries). Dann gelten offene Einträge, die das Guthaben KOMPLETT abdeckt, als bezahlt (älteste zuerst).
-- Jeder Eintrag merkt sich in creditUsed, wie viel Guthaben er verbraucht hat; wird er wieder geöffnet oder
-- gelöscht, bucht ein Trigger das Guthaben zurück. app.credit_busy verhindert, dass der Trigger beim Buchen anspringt.

create or replace function public.credit_left(pid text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce((data->>'amount')::numeric,0) - coalesce((data->>'credited')::numeric,0)), 0)
    from public.bills
   where data->>'paidBy' = pid and coalesce(data->>'kind','') <> 'einzahlung'
     and not coalesce((data->>'refunded')::boolean, false)
     and coalesce((data->>'amount')::numeric,0) - coalesce((data->>'credited')::numeric,0) > 0
$$;

-- verbraucht bis zu `amount` Guthaben (älteste Rechnung zuerst); gibt zurück, wie viel verbraucht wurde
create or replace function public.consume_credit(pid text, amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare rest numeric := round(coalesce(amount,0), 2); b record; lft numeric; take numeric; cr numeric; amt numeric;
begin
  for b in select id, data from public.bills
     where data->>'paidBy' = pid and coalesce(data->>'kind','') <> 'einzahlung'
       and not coalesce((data->>'refunded')::boolean, false)
       and coalesce((data->>'amount')::numeric,0) - coalesce((data->>'credited')::numeric,0) > 0
     order by data->>'date', data->>'createdAt', id
     for update
  loop
    exit when rest <= 0;
    amt := round(coalesce((b.data->>'amount')::numeric,0), 2);
    lft := amt - coalesce((b.data->>'credited')::numeric,0);
    take := least(rest, lft);
    cr := round(coalesce((b.data->>'credited')::numeric,0) + take, 2);
    rest := round(rest - take, 2);
    update public.bills
       set data = data || case when cr >= amt then jsonb_build_object('credited', cr, 'refunded', true, 'verrechnet', true)
                               else jsonb_build_object('credited', cr) end,
           updated_at = now()
     where id = b.id;
  end loop;
  return round(coalesce(amount,0) - rest, 2);
end $$;

-- gibt verbrauchtes Guthaben zurück (neueste Rechnung zuerst), z. B. wenn ein Eintrag wieder geöffnet oder gelöscht wird
create or replace function public.give_back_credit(pid text, amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare rest numeric := round(coalesce(amount,0), 2); b record; back numeric;
begin
  for b in select id, data from public.bills
     where data->>'paidBy' = pid and coalesce(data->>'kind','') <> 'einzahlung'
       and coalesce((data->>'credited')::numeric,0) > 0
       and (not coalesce((data->>'refunded')::boolean, false) or coalesce((data->>'verrechnet')::boolean, false))
     order by data->>'date' desc, data->>'createdAt' desc, id desc
     for update
  loop
    exit when rest <= 0;
    back := least(rest, (b.data->>'credited')::numeric);
    rest := round(rest - back, 2);
    update public.bills
       set data = data || jsonb_build_object('credited', round((b.data->>'credited')::numeric - back, 2), 'refunded', false, 'verrechnet', false),
           updated_at = now()
     where id = b.id;
  end loop;
end $$;

-- bucht offene Einträge einer Person mit ihrem Guthaben (nur solche, die komplett abgedeckt sind)
create or replace function public.apply_credit(pid text) returns int
language plpgsql security definer set search_path = public as $$
declare cred numeric; e record; n int := 0; used numeric := 0; ts text; prev text;
begin
  if pid is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('credit:' || pid));
  cred := public.credit_left(pid);
  if cred <= 0 then return 0; end if;
  prev := coalesce(current_setting('app.credit_busy', true), '');
  perform set_config('app.credit_busy', '1', true);
  ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  for e in select id, (data->>'amount')::numeric as amt from public.entries
     where data->>'playerId' = pid
       and not coalesce((data->>'paid')::boolean, false)
       and not coalesce((data->>'reported')::boolean, false)   -- schon als bezahlt gemeldet: Kassenwart prüft die echte Zahlung
       and not coalesce((data->>'noAuto')::boolean, false)
       and coalesce((data->>'amount')::numeric, 0) > 0
     order by data->>'date', data->>'createdAt', id
     for update
  loop
    if e.amt <= cred + 0.001 then
      update public.entries
         set data = data || jsonb_build_object('paid', true, 'paidAt', ts, 'paidVia', 'guthaben', 'creditUsed', e.amt),
             updated_at = now()
       where id = e.id;
      cred := cred - e.amt; used := used + e.amt; n := n + 1;
    end if;
  end loop;
  if used > 0 then perform public.consume_credit(pid, used); end if;
  perform set_config('app.credit_busy', prev, true);
  return n;
end $$;

create or replace function public.credit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev text; reopened boolean;
begin
  if coalesce(current_setting('app.credit_busy', true), '') = '1' then return null; end if;
  if tg_table_name = 'entries' then
    -- Eintrag, der Guthaben verbraucht hatte, wird wieder geöffnet oder gelöscht → Guthaben zurück.
    -- NEW gibt es bei DELETE nicht; PostgreSQL garantiert keine Kurzschluss-Auswertung, deshalb getrennt prüfen.
    if tg_op = 'DELETE' then reopened := true;
    else reopened := not coalesce((new.data->>'paid')::boolean, false); end if;
    if reopened
       and coalesce((old.data->>'paid')::boolean, false)
       and coalesce((old.data->>'creditUsed')::numeric, 0) > 0 then
      prev := coalesce(current_setting('app.credit_busy', true), '');
      perform set_config('app.credit_busy', '1', true);
      perform public.give_back_credit(old.data->>'playerId', (old.data->>'creditUsed')::numeric);
      if tg_op = 'UPDATE' then
        update public.entries set data = data - 'creditUsed', updated_at = now() where id = new.id;
      end if;
      perform set_config('app.credit_busy', prev, true);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists entries_credit on public.entries;
create trigger entries_credit after update or delete on public.entries for each row execute function public.credit_trigger();

-- beim Start des Zahltags: Guthaben aller Personen verrechnen. Nur Kassenwart und Admin.
create or replace function public.apply_credit_all() returns int
language plpgsql security definer set search_path = public as $$
declare p record; n int := 0;
begin
  if not coalesce(public.can_book(), false) then raise exception 'Nur Kassenwart und Admin'; end if;
  for p in select id from public.players loop
    n := n + public.apply_credit(p.id);
  end loop;
  return n;
end $$;

-- „Alles bezahlt“ / Zahlung bestätigen: markiert die Einträge als bezahlt und verrechnet dabei vorhandenes Guthaben
-- (auch Teilbeträge). Nur Kassenwart und Admin.
create or replace function public.pay_entries(pid text, ids text[], via text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e record; total numeric := 0; used numeric; rest numeric; part numeric; n int := 0; ts text; prev text;
begin
  if not coalesce(public.can_book(), false) then raise exception 'Nur Kassenwart und Admin'; end if;
  if via not in ('kassenwart','bestaetigt') then via := 'kassenwart'; end if;
  perform pg_advisory_xact_lock(hashtext('credit:' || pid));
  prev := coalesce(current_setting('app.credit_busy', true), '');
  perform set_config('app.credit_busy', '1', true);
  ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  select coalesce(sum(coalesce((data->>'amount')::numeric,0)), 0) into total from public.entries
   where id = any(ids) and data->>'playerId' = pid and not coalesce((data->>'paid')::boolean, false);
  used := public.consume_credit(pid, total);
  rest := used;
  for e in select id, coalesce((data->>'amount')::numeric,0) as amt from public.entries
     where id = any(ids) and data->>'playerId' = pid and not coalesce((data->>'paid')::boolean, false)
     order by data->>'date', data->>'createdAt', id
     for update
  loop
    part := least(rest, e.amt); rest := rest - part;
    update public.entries
       set data = data || jsonb_build_object('paid', true, 'paidAt', ts, 'paidVia', via)
                 || case when part > 0 then jsonb_build_object('creditUsed', part) else '{}'::jsonb end,
           updated_at = now()
     where id = e.id;
    n := n + 1;
  end loop;
  perform set_config('app.credit_busy', prev, true);
  return jsonb_build_object('n', n, 'used', used);
end $$;

revoke execute on function public.credit_left(text), public.consume_credit(text, numeric), public.give_back_credit(text, numeric),
  public.apply_credit(text), public.credit_trigger() from public, anon, authenticated;
grant execute on function public.pay_entries(text, text[], text), public.apply_credit_all() to authenticated;
revoke execute on function public.pay_entries(text, text[], text), public.apply_credit_all() from public, anon;

-- ---------- Rechnungen mit verrechnetem Guthaben schützen ----------
-- Mit einer Rechnung wurden schon Strafen bezahlt (bills.credited > 0): sie darf weder gelöscht noch auf eine andere
-- Person umgeschrieben oder unter den verrechneten Betrag gekürzt werden. Erst die Strafen wieder öffnen (das bucht Guthaben zurück).
-- Interne Buchungen (consume_credit / give_back_credit) ändern nur credited/refunded/verrechnet und laufen durch.
create or replace function public.bills_guard() returns trigger
language plpgsql set search_path = public as $$
declare cr numeric := coalesce((old.data->>'credited')::numeric, 0); vr boolean := coalesce((old.data->>'verrechnet')::boolean, false);
begin
  if tg_op = 'DELETE' then
    if cr > 0 then
      raise exception 'Mit dieser Rechnung wurden schon Strafen bezahlt. Öffne zuerst diese Strafen wieder.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  -- interne Buchungen (consume_credit / give_back_credit) laufen mit app.credit_busy und dürfen credited ändern
  if coalesce(current_setting('app.credit_busy', true), '') = '1' then return new; end if;
  -- alles andere (z. B. ein Browser mit veraltetem Stand) darf credited/verrechnet nicht überschreiben
  new.data := new.data || jsonb_build_object('credited', cr, 'verrechnet', vr);
  if vr then new.data := new.data || jsonb_build_object('refunded', true); end if;
  if cr > 0 and ((new.data->>'paidBy') is distinct from (old.data->>'paidBy')
                 or coalesce((new.data->>'amount')::numeric, 0) < cr) then
    raise exception 'Mit dieser Rechnung wurden schon Strafen bezahlt (% €). Person und Betrag lassen sich nicht mehr ändern.', cr using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists bills_guard on public.bills;
create trigger bills_guard before update or delete on public.bills for each row execute function public.bills_guard();

-- ---------- Interne Kassendaten (nur Kassenwart und Admin) ----------
-- Kassenstand-Abgleiche, Backup-Zeitpunkt und Änderungsprotokoll: Spieler dürfen das weder lesen noch schreiben
-- (die Tabelle `settings` ist für alle freigeschalteten Mitglieder lesbar und eignet sich dafür nicht).
create table if not exists public.kasse_intern (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now());
alter table public.kasse_intern enable row level security;
drop policy if exists kasse_intern_read on public.kasse_intern;
create policy kasse_intern_read on public.kasse_intern for select using (public.can_book());
drop policy if exists kasse_intern_ins on public.kasse_intern;
create policy kasse_intern_ins on public.kasse_intern for insert with check (public.can_book());
drop policy if exists kasse_intern_upd on public.kasse_intern;
create policy kasse_intern_upd on public.kasse_intern for update using (public.can_book()) with check (public.can_book());
drop policy if exists kasse_intern_del on public.kasse_intern;
create policy kasse_intern_del on public.kasse_intern for delete using (public.can_book());
do $$
begin
  alter publication supabase_realtime add table public.kasse_intern;
exception when duplicate_object then null;
end $$;
