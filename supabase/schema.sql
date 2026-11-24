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

-- Rollen: member (Spieler), kassenwart, admin, deckenzaehler (wie Spieler + „Fußball an der Decke“ selbst eintragen), wasserwart / aufraeumdienst (nur Bezeichnung), kabinenfestwart (plant und hakt Kabinenfeste ab), strafenwart (trägt Strafen aus dem Katalog ein, auch mit Foto), doenerwart (wie Spieler, hakt Döner-Zahlungen ab), trainer (wie Spieler, ändert alles im Kalender), mannschaftsverantwortlicher (wie Spieler, trägt Treffpunkte bei Spielen ein), trikotwart (wie Spieler, ändert als Einziger die Trikots)
-- Eine Person kann mehrere Rollen haben: `role` ist die Hauptrolle, `roles` die weiteren Rollen.
alter table public.members add column if not exists roles text[] not null default '{}';
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.members'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%role%' loop
    execute format('alter table public.members drop constraint %I', c);
  end loop;
  alter table public.members add constraint members_role_check check (role in ('member','kassenwart','admin','deckenzaehler','doenerwart','trainer','mannschaftsverantwortlicher','trikotwart','wasserwart','aufraeumdienst','kabinenfestwart','strafenwart'));
  alter table public.members add constraint members_roles_check check (roles <@ array['kassenwart','admin','deckenzaehler','doenerwart','trainer','mannschaftsverantwortlicher','trikotwart','wasserwart','aufraeumdienst','kabinenfestwart','strafenwart']);
end $$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select case when approved then role end from public.members where user_id = auth.uid()
$$;
-- hat das eigene (freigeschaltete) Konto diese Rolle, als Hauptrolle oder als weitere Rolle?
create or replace function public.has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select approved and r = any(roles || role) from public.members where user_id = auth.uid()), false)
$$;
create or replace function public.is_member() returns boolean language sql stable security definer set search_path = public as $$ select public.my_role() is not null $$;
create or replace function public.is_admin()  returns boolean language sql stable security definer set search_path = public as $$ select public.has_role('admin') $$;
create or replace function public.is_kw()     returns boolean language sql stable security definer set search_path = public as $$ select public.has_role('kassenwart') $$;
-- Wichtig: nie NULL zurückgeben. Ohne Rolle wäre `not can_book()` sonst NULL und eine Prüfung `if not can_book()` liefe ins Leere.
create or replace function public.can_book()  returns boolean language sql stable security definer set search_path = public as $$ select public.has_role('admin') or public.has_role('kassenwart') $$;

alter table public.members enable row level security;
drop policy if exists members_read on public.members;
create policy members_read on public.members for select using (user_id = auth.uid() or public.is_member());
drop policy if exists members_signup on public.members;
create policy members_signup on public.members for insert
  with check (user_id = auth.uid() and role = 'member' and roles = '{}' and approved = false);
drop policy if exists members_admin_update on public.members;
-- Rollen verwalten: Admin darf alles. Der Kassenwart darf Mitglieder freischalten/sperren und die Rollen member/deckenzaehler/doenerwart/trainer/mannschaftsverantwortlicher/trikotwart
-- vergeben, aber niemanden zum Admin oder Kassenwart machen und Admins/Kassenwarte (auch als weitere Rolle) weder ändern noch entfernen.
create policy members_admin_update on public.members for update
  using (public.is_admin() or (public.is_kw() and not (roles || role) && array['admin','kassenwart']))
  with check (public.is_admin() or (public.is_kw() and not (roles || role) && array['admin','kassenwart']));
drop policy if exists members_admin_delete on public.members;
create policy members_admin_delete on public.members for delete
  using (public.is_admin() or (public.is_kw() and not (roles || role) && array['admin','kassenwart']) or (user_id = auth.uid() and approved = false));

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

-- Amt mit Strafrecht: nur der Deckenzähler („Fußball an der Decke“ f26). Wasserwart und Aufräumdienst sind reine Bezeichnungen; sie melden Verstöße wie alle als Anzeige, die der Kassenwart bestätigt.
-- Sie dürfen NUR diese Strafen für andere eintragen (ohne Kabinenfest, höchstens 50 €) und eigene, unbezahlte Einträge zurücknehmen.
create or replace function public.is_decke() returns boolean language sql stable security definer set search_path = public as $$ select public.has_role('deckenzaehler') $$;
create or replace function public.amt_fine(fid text) returns boolean language sql stable security definer set search_path = public as $$
  select fid = 'f26' and public.has_role('deckenzaehler')
$$;
drop policy if exists entries_decke_ins on public.entries;
drop policy if exists entries_decke_upd on public.entries;
drop policy if exists entries_decke_del on public.entries;
drop policy if exists entries_amt_ins on public.entries;
-- id nur im Format, das die App vergibt: so kann niemand feste Kennungen (verzug-…, kf-gb-…, anz-…) vorab belegen und damit Verzugsstrafen oder Kabinenfeste verhindern
create policy entries_amt_ins on public.entries for insert with check (
  id ~ '^[a-z0-9]{9,20}$' and coalesce(data->>'playerId', '') !~ '^team-'
  and public.amt_fine(data->>'fineId') and data->>'createdBy' = auth.uid()::text
  and not coalesce((data->>'paid')::boolean, false) and not coalesce((data->>'kabinenfest')::boolean, false)
  and (data->>'amount')::numeric between 0 and 50);
drop policy if exists entries_amt_upd on public.entries;
create policy entries_amt_upd on public.entries for update
  using (public.amt_fine(data->>'fineId') and data->>'createdBy' = auth.uid()::text and not coalesce((data->>'paid')::boolean, false))
  with check (public.amt_fine(data->>'fineId') and data->>'createdBy' = auth.uid()::text and not coalesce((data->>'paid')::boolean, false)
  and not coalesce((data->>'kabinenfest')::boolean, false) and (data->>'amount')::numeric between 0 and 50);
drop policy if exists entries_amt_del on public.entries;
create policy entries_amt_del on public.entries for delete
  using (public.amt_fine(data->>'fineId') and data->>'createdBy' = auth.uid()::text and not coalesce((data->>'paid')::boolean, false));

-- Teil-Update eines Dokuments (RLS gilt, weil security invoker)
create or replace function public.doc_patch(t text, doc_id text, patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if t not in ('players','fines','entries','bills','settings','zahltag','receipts','schulden','anzeigen') then raise exception 'unknown table'; end if;
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
  if n > 0 then perform public.push_meldung(pid); end if; -- Kassenwart/Admin benachrichtigen (siehe unten)
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

-- Profilfotos im Kader: öffentlich lesbar (wie die bisherigen Fotos in img/), max. 1 MB, nur Bilder. Hochladen/Löschen nur Kassenwart und Admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = excluded.allowed_mime_types;
-- Lesen per Abfrage braucht es zum Löschen alter Fotos (die Bilder selbst sind über die öffentliche Adresse ohnehin abrufbar)
drop policy if exists fotos_read on storage.objects;
create policy fotos_read on storage.objects for select using (bucket_id = 'fotos' and public.can_book());
drop policy if exists fotos_ins on storage.objects;
create policy fotos_ins on storage.objects for insert with check (bucket_id = 'fotos' and public.can_book());
drop policy if exists fotos_del on storage.objects;
create policy fotos_del on storage.objects for delete using (bucket_id = 'fotos' and public.can_book());

-- Live-Updates für Belege (erst nach dem Anlegen der Tabelle)
do $$
begin
  alter publication supabase_realtime add table public.receipts;
exception when duplicate_object then null;
end $$;

-- ---------- Guthaben mit Strafen verrechnen ----------
-- Guthaben einer Person = ausgelegte Rechnungen/Gutschriften (bills.paidBy), noch nicht ausbezahlt (refunded),
-- minus der Teil, der schon verrechnet wurde (bills.credited).
-- Bis zum Zahltag bleiben die Strafen offen stehen; die App zeigt nur „offen − Guthaben“ an.
-- Verrechnet wird beim Start des Zahltags (apply_credit_all): älteste Einträge zuerst, solange Guthaben da ist, werden sie
-- bezahlt; reicht der Rest nicht für den nächsten Eintrag, wird er dort als Teilbetrag gebucht (creditUsed, Eintrag bleibt offen).
-- pay_entries verrechnet beim Bestätigen einer Zahlung, payout_credit setzt ausbezahltes Guthaben auf 0.
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

-- bucht offene Einträge einer Person mit ihrem Guthaben (älteste zuerst; der letzte bekommt ggf. einen Teilbetrag)
create or replace function public.apply_credit(pid text) returns int
language plpgsql security definer set search_path = public as $$
declare cred numeric; e record; n int := 0; used numeric := 0; take numeric; ts text; prev text;
begin
  if pid is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('credit:' || pid));
  cred := round(public.credit_left(pid), 2);
  if cred <= 0 then return 0; end if;
  prev := coalesce(current_setting('app.credit_busy', true), '');
  perform set_config('app.credit_busy', '1', true);
  ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  for e in select id, (data->>'amount')::numeric as amt, coalesce((data->>'creditUsed')::numeric, 0) as cu from public.entries
     where data->>'playerId' = pid
       and not coalesce((data->>'paid')::boolean, false)
       and not coalesce((data->>'reported')::boolean, false)   -- schon als bezahlt gemeldet: Kassenwart prüft die echte Zahlung
       and not coalesce((data->>'noAuto')::boolean, false)
       and coalesce((data->>'amount')::numeric, 0) - coalesce((data->>'creditUsed')::numeric, 0) > 0
     order by data->>'date', data->>'createdAt', id
     for update
  loop
    exit when cred <= 0;
    take := least(cred, e.amt - e.cu);
    update public.entries
       set data = data || jsonb_build_object('creditUsed', round(e.cu + take, 2))
                 || case when take >= e.amt - e.cu then jsonb_build_object('paid', true, 'paidAt', ts, 'paidVia', 'guthaben') else '{}'::jsonb end,
           updated_at = now()
     where id = e.id;
    cred := round(cred - take, 2); used := used + take; n := n + 1;
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
    -- Gelöscht wird auch ein offener Eintrag mit Teilbetrag (creditUsed) → dessen Guthaben zurück.
    if tg_op = 'DELETE' then reopened := true;
    else reopened := coalesce((old.data->>'paid')::boolean, false) and not coalesce((new.data->>'paid')::boolean, false); end if;
    -- Offener Eintrag mit Teilbetrag bekommt eine andere Person oder einen kleineren Betrag → Teilbetrag zurück an den alten Spieler.
    if not reopened and tg_op = 'UPDATE' and not coalesce((new.data->>'paid')::boolean, false)
       and ((new.data->>'playerId') is distinct from (old.data->>'playerId')
            or coalesce((new.data->>'amount')::numeric, 0) < coalesce((old.data->>'creditUsed')::numeric, 0)) then
      reopened := true;
    end if;
    if reopened
       and coalesce((old.data->>'creditUsed')::numeric, 0) > 0 then
      prev := coalesce(current_setting('app.credit_busy', true), '');
      perform set_config('app.credit_busy', '1', true);
      perform public.give_back_credit(old.data->>'playerId', (old.data->>'creditUsed')::numeric);
      if tg_op = 'UPDATE' then -- wieder offen: Guthaben ist zurück, beim nächsten Zahltag wird neu verrechnet
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
  select coalesce(sum(coalesce((data->>'amount')::numeric,0) - coalesce((data->>'creditUsed')::numeric,0)), 0) into total from public.entries
   where id = any(ids) and data->>'playerId' = pid and not coalesce((data->>'paid')::boolean, false);
  used := public.consume_credit(pid, total);
  rest := used;
  for e in select id, coalesce((data->>'amount')::numeric,0) as amt, coalesce((data->>'creditUsed')::numeric,0) as cu from public.entries
     where id = any(ids) and data->>'playerId' = pid and not coalesce((data->>'paid')::boolean, false)
     order by data->>'date', data->>'createdAt', id
     for update
  loop
    part := greatest(least(rest, e.amt - e.cu), 0); rest := rest - part;
    update public.entries
       set data = data || jsonb_build_object('paid', true, 'paidAt', ts, 'paidVia', via)
                 || case when e.cu + part > 0 then jsonb_build_object('creditUsed', round(e.cu + part, 2)) else '{}'::jsonb end,
           updated_at = now()
     where id = e.id;
    n := n + 1;
  end loop;
  perform set_config('app.credit_busy', prev, true);
  return jsonb_build_object('n', n, 'used', used);
end $$;

-- früher: sofort verrechnen (credit_auto) – jetzt erst beim Zahltag
drop trigger if exists bills_credit_auto on public.bills;
drop trigger if exists entries_credit_auto on public.entries;
drop function if exists public.credit_auto();

-- „Ausbezahlt“: der Kassenwart hat das restliche Guthaben überwiesen → Guthaben auf 0 (Rechnungen gelten als erstattet).
-- Gibt den ausbezahlten Betrag zurück. Nur Kassenwart und Admin.
create or replace function public.payout_credit(pid text) returns numeric
language plpgsql security definer set search_path = public as $$
declare amt numeric; prev text;
begin
  if not coalesce(public.can_book(), false) then raise exception 'Nur Kassenwart und Admin'; end if;
  perform pg_advisory_xact_lock(hashtext('credit:' || pid));
  perform public.apply_credit(pid); -- erst offene Strafen verrechnen, nur der Rest wird ausbezahlt
  amt := round(public.credit_left(pid), 2);
  if amt <= 0 then return 0; end if;
  prev := coalesce(current_setting('app.credit_busy', true), '');
  perform set_config('app.credit_busy', '1', true);
  update public.bills
     set data = data || jsonb_build_object('refunded', true, 'refundedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
         updated_at = now()
   where data->>'paidBy' = pid and coalesce(data->>'kind','') <> 'einzahlung'
     and not coalesce((data->>'refunded')::boolean, false)
     and coalesce((data->>'amount')::numeric,0) - coalesce((data->>'credited')::numeric,0) > 0;
  perform set_config('app.credit_busy', prev, true);
  return amt;
end $$;

revoke execute on function public.credit_left(text), public.consume_credit(text, numeric), public.give_back_credit(text, numeric),
  public.apply_credit(text), public.credit_trigger() from public, anon, authenticated;
grant execute on function public.pay_entries(text, text[], text), public.apply_credit_all(), public.payout_credit(text) to authenticated;
revoke execute on function public.pay_entries(text, text[], text), public.apply_credit_all(), public.payout_credit(text) from public, anon;

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

-- ---------- Döner-Bestellungen (nur dienstags, bis 18 Uhr deutsche Zeit; 12 Uhr Erinnerung an alle) ----------
-- Jeder freigeschaltete Spieler trägt nur seine eigene Bestellung ein und kann sie bis zum Bestellschluss ändern oder löschen.
-- Danach ist die Liste fest. Niemand löscht fremde Bestellungen, auch nicht Admin oder Kassenwart.
-- Ab Mittwoch räumt doener_cleanup() die Bestellungen vergangener Dienstage weg.
create or replace function public.my_pid() returns text
language sql stable security definer set search_path = public as $$
  select player_id from public.members where user_id = auth.uid() and approved
$$;
create or replace function public.doener_open(w text) returns boolean
language plpgsql stable set search_path = public as $$
declare d date; n timestamp := now() at time zone 'Europe/Berlin';
begin
  if w is null or w !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  begin d := w::date; exception when others then return false; end;
  -- nur am Dienstag selbst (deutsche Zeit) und nur bis 18:00 Uhr
  return extract(isodow from d) = 2 and d = n::date and n < d + time '18:00';
end $$;
revoke execute on function public.my_pid(), public.doener_open(text) from public, anon;
grant execute on function public.my_pid(), public.doener_open(text) to authenticated;

create table if not exists public.doener (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now());
alter table public.doener enable row level security;
drop policy if exists doener_read on public.doener;
create policy doener_read on public.doener for select using (public.is_member());
drop policy if exists doener_ins on public.doener;
create policy doener_ins on public.doener for insert with check (
  public.is_member() and data->>'pid' = public.my_pid() and id = (data->>'week') || '_' || (data->>'pid')
  and public.doener_open(data->>'week') and length(coalesce(data->>'text', '')) between 1 and 200);
drop policy if exists doener_upd on public.doener;
create policy doener_upd on public.doener for update
  using (public.is_member() and data->>'pid' = public.my_pid() and public.doener_open(data->>'week'))
  with check (
  public.is_member() and data->>'pid' = public.my_pid() and id = (data->>'week') || '_' || (data->>'pid')
  and public.doener_open(data->>'week') and length(coalesce(data->>'text', '')) between 1 and 200);
drop policy if exists doener_del on public.doener;
create policy doener_del on public.doener for delete
  using (data->>'pid' = public.my_pid() and public.doener_open(data->>'week'));
-- Löscht Bestellungen für Dienstage, die vor gestern lagen (deutsche Zeit): Mittwochs ist die Liste noch da (Zahlungs-Erinnerung). Die App ruft das beim Start auf.
create or replace function public.doener_cleanup() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_member() then return 0; end if;
  delete from public.doener
   where case when data->>'week' ~ '^\d{4}-\d{2}-\d{2}$' then (data->>'week')::date < (now() at time zone 'Europe/Berlin')::date - 1 else true end;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.doener_cleanup() from public, anon;
grant execute on function public.doener_cleanup() to authenticated;

-- Dönerwart: Rolle „doenerwart“ unter Mitglieder & Rollen. Er bekommt „Ich habe bezahlt“ als Nachricht und hakt die Zahlungen ab.
create or replace function public.is_doenerwart() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_role('doenerwart') $$;
-- Nur der Dönerwart hakt eine Bestellung als bezahlt ab oder macht es rückgängig
create or replace function public.doener_set_paid(doc_id text, paid boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_doenerwart() then raise exception 'Nur der Dönerwart darf das'; end if;
  update public.doener
     set data = case when paid then data || jsonb_build_object('paid', true, 'paidAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                     else data - 'paid' - 'paidAt' end,
         updated_at = now()
   where id = doc_id;
end $$;
-- Spieler meldet „Ich habe den Döner bezahlt“ → Nachricht an den Dönerwart. „bezahlt“ bleibt allein beim Dönerwart; die Meldung (reportedAt) stoppt nur die Mittwochs-Erinnerung.
create or replace function public.doener_report_paid(w text) returns int
language plpgsql security definer set search_path = public as $$
declare pid text := public.my_pid(); nm text; t text;
begin
  if pid is null then raise exception 'Kein verknüpfter Spieler'; end if;
  select data->>'text' into t from public.doener where id = w || '_' || pid;
  if t is null then raise exception 'Du hast diese Woche keinen Döner bestellt'; end if;
  if not exists (select 1 from public.members where 'doenerwart' = any(roles || role) and approved) then raise exception 'Es ist noch kein Dönerwart festgelegt'; end if;
  update public.doener set data = data || jsonb_build_object('reportedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) where id = w || '_' || pid;
  select data->>'name' into nm from public.players where id = pid;
  return public.push_send('doener', null, array['doenerwart'], '💶 Döner bezahlt',
    coalesce(nm, 'Jemand') || ' hat bezahlt – bitte abhaken.', 'doener-bezahlt');
end $$;
-- Schutz: „bezahlt“ (paid/paidAt) setzen oder entfernen darf nur der Dönerwart. Bei allen anderen werden die beiden
-- Felder beim Speichern auf den bisherigen Stand zurückgesetzt (Spieler ändern nur ihren Bestelltext).
create or replace function public.doener_guard_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_doenerwart() then return new; end if;
  new.data := new.data - 'paid' - 'paidAt';
  if tg_op = 'UPDATE' then
    new.data := new.data || jsonb_strip_nulls(jsonb_build_object('paid', old.data->'paid', 'paidAt', old.data->'paidAt'));
  end if;
  return new;
end $$;
drop trigger if exists doener_guard_paid on public.doener;
create trigger doener_guard_paid before insert or update on public.doener for each row execute function public.doener_guard_paid();
revoke execute on function public.is_doenerwart(), public.doener_set_paid(text, boolean), public.doener_report_paid(text) from public, anon;
grant execute on function public.is_doenerwart(), public.doener_set_paid(text, boolean), public.doener_report_paid(text) to authenticated;

-- ---------- Fußball: Team Jung gegen Team Alt ----------
-- Alle Mitglieder sehen Spiele und Torschützen, eintragen dürfen nur Kassenwart und Admin.
create table if not exists public.fussball (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now());
alter table public.fussball enable row level security;
drop policy if exists fussball_read on public.fussball;
create policy fussball_read on public.fussball for select using (public.is_member());
drop policy if exists fussball_ins on public.fussball;
create policy fussball_ins on public.fussball for insert with check (public.can_book());
drop policy if exists fussball_upd on public.fussball;
create policy fussball_upd on public.fussball for update using (public.can_book()) with check (public.can_book());
drop policy if exists fussball_del on public.fussball;
create policy fussball_del on public.fussball for delete using (public.can_book());

do $$
declare t text;
begin
  foreach t in array array['doener','fussball'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- Push-Benachrichtigungen (kostenlos: Web Push + Edge Function + pg_net + pg_cron im Free-Plan) ----------
-- Ablauf: Die Datenbank entscheidet, wer welche Nachricht bekommt (push_send), und schickt die Liste der Geräte
-- über pg_net an die Edge Function „push“ (supabase/functions/push). Die verschlüsselt und versendet.
-- Schlüssel erzeugt der Server selbst (Tabelle push_config, nur für den Server lesbar) – niemand muss etwas eintippen.
-- Fehler beim Benachrichtigen dürfen nie eine Buchung verhindern – deshalb fängt jede Push-Funktion alles ab.
do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net nicht verfügbar: %', sqlerrm; end $$;
do $$ begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron nicht verfügbar: %', sqlerrm; end $$;

-- Ein Eintrag pro Gerät. Jeder sieht und verwaltet nur seine eigenen Geräte.
create table if not exists public.push_subs (
  endpoint   text primary key check (length(endpoint) < 1000 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com)/'),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh     text not null check (length(p256dh) between 60 and 120),
  auth       text not null check (length(auth) between 16 and 40),
  prefs      jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Verlauf: jede Benachrichtigung landet für jedes Mitglied, an das sie geht, im eigenen Verlauf (auch wenn Benachrichtigungen aus sind).
-- Lesen nur die eigenen, schreiben nur push_send(); push_tick() löscht alles, was älter als 30 Tage ist.
create table if not exists public.push_verlauf (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind    text not null,
  title   text not null check (length(title) < 300),
  body    text check (length(body) < 1000),
  tag     text check (length(tag) < 200), -- z. B. umfrage-<Spiel>: daraus springt die App an die richtige Stelle
  at      timestamptz not null default now()
);
create index if not exists push_verlauf_user on public.push_verlauf (user_id, at desc);
alter table public.push_verlauf enable row level security;
drop policy if exists push_verlauf_read on public.push_verlauf;
create policy push_verlauf_read on public.push_verlauf for select using (user_id = auth.uid());
alter table public.push_subs enable row level security;
drop policy if exists push_subs_read on public.push_subs;
create policy push_subs_read on public.push_subs for select using (user_id = auth.uid());
drop policy if exists push_subs_ins on public.push_subs;
create policy push_subs_ins on public.push_subs for insert with check (user_id = auth.uid() and public.is_member());
drop policy if exists push_subs_upd on public.push_subs;
create policy push_subs_upd on public.push_subs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists push_subs_del on public.push_subs;
create policy push_subs_del on public.push_subs for delete using (user_id = auth.uid());

create or replace function public.eur_txt(x numeric) returns text language sql immutable as $$
  select replace(to_char(round(coalesce(x, 0), 2), 'FM9999990.00'), '.', ',') || ' €'
$$;
-- Betrag aus jsonb lesen, ohne bei kaputten Werten abzubrechen
create or replace function public.num_or0(t text) returns numeric language sql immutable as $$
  select case when t ~ '^\s*-?\d+(\.\d+)?\s*$' then t::numeric else 0 end
$$;
create or replace function public.berlin_txt(ts text) returns text language sql stable as $$
  select to_char(ts::timestamptz at time zone 'Europe/Berlin', 'DD.MM. "um" HH24:MI') || ' Uhr'
$$;

-- Geheimnis für den Aufruf der Edge Function und die VAPID-Schlüssel. Kein Zugriff für App-Nutzer (RLS ohne Regeln),
-- nur Datenbank-Funktionen und die Edge Function (Service-Schlüssel) lesen hier. Das Geheimnis entsteht zufällig in der Datenbank,
-- die VAPID-Schlüssel erzeugt die Edge Function beim ersten Aufruf selbst.
create table if not exists public.push_config (
  id            int primary key default 1 check (id = 1),
  secret        text not null,
  vapid_public  text,
  vapid_private jsonb,
  updated_at    timestamptz not null default now()
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id, secret)
values (1, encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'))
on conflict (id) do nothing;

-- schickt die Nachricht an die Edge Function (asynchron, nach dem Speichern)
create or replace function public.push_post(payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  select c.secret into secret from public.push_config c where c.id = 1;
  if secret is null then return; end if;
  perform net.http_post(url := 'https://ezgvbwxyyryuurgaczoq.supabase.co/functions/v1/push', body := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret), timeout_milliseconds := 10000);
exception when others then raise warning 'push_post: %', sqlerrm;
end $$;

-- Empfänger auswählen: pids = bestimmte Spieler, roles = bestimmte Rollen, uid = ein bestimmtes Konto, alles null = alle.
-- kind ist die Kategorie, die jeder pro Gerät abschalten kann (strafe, zahltag, doener, fussball, meldung).
create or replace function public.push_send(kind text, pids text[], roles text[], title text, body text, tag text default null, uid uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare subs jsonb; n int;
begin
  if kind <> 'test' then
    insert into public.push_verlauf (user_id, kind, title, body, tag)
    select m.user_id, push_send.kind, push_send.title, left(push_send.body, 999), left(push_send.tag, 199) from public.members m
     where m.approved and (pids is null or m.player_id = any(pids))
       and (push_send.roles is null or (m.roles || m.role) && push_send.roles) and (uid is null or m.user_id = uid);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb), count(*)
    into subs, n
    from public.push_subs s join public.members m on m.user_id = s.user_id and m.approved
   where coalesce(s.prefs->>kind, 'true') <> 'false'
     and (pids is null or m.player_id = any(pids))
     and (push_send.roles is null or (m.roles || m.role) && push_send.roles)
     and (uid is null or s.user_id = uid);
  if n = 0 then return 0; end if;
  perform public.push_post(jsonb_build_object('subs', subs, 'title', title, 'body', body, 'tag', tag));
  return n;
exception when others then raise warning 'push_send: %', sqlerrm; return 0;
end $$;

-- Neue Strafe → betroffener Spieler; Fußball-Runde vorbei → alle
create or replace function public.push_entries_ins() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb := new.data; pid text := new.data->>'playerId'; amt numeric;
begin
  if new.id like 'kf-gb-%' then
    return null; -- Geburtstags-Kabinenfest: dafür gibt es schon die Geburtstagsnachricht
  elsif new.id like 'kf-fb-%' then
    perform public.push_send('fussball', null, null, '⚽ Runde vorbei',
      case pid when 'team-jung' then 'Team Jung' when 'team-alt' then 'Team Alt' else 'Ein Team' end || ' schmeißt ein Kabinenfest 🍻', 'fussball');
  elsif pid is not null and pid not like 'team-%' and not coalesce((d->>'paid')::boolean, false) then
    amt := public.num_or0(d->>'amount');
    perform public.push_send('strafe', array[pid], null,
      case when amt > 0 then '💸 Du hast eine neue Strafe' when coalesce((d->>'kabinenfest')::boolean, false) then '🍻 Du hast ein Kabinenfest' else 'Neuer Eintrag' end,
      case when amt > 0 then coalesce(d->>'title', 'Strafe') || ' · ' || public.eur_txt(amt)
                             || case when coalesce((d->>'kabinenfest')::boolean, false) then ' + Kabinenfest' else '' end
           else coalesce(nullif(d->>'note', ''), d->>'title', 'Kabinenfest') end);
  end if;
  return null;
exception when others then raise warning 'push_entries_ins: %', sqlerrm; return null;
end $$;
drop trigger if exists push_entries_ins on public.entries;
create trigger push_entries_ins after insert on public.entries for each row execute function public.push_entries_ins();

-- Zahltag gestartet → jeder, der etwas zahlen muss
create or replace function public.push_zahltag_ins() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if coalesce((new.data->>'active')::boolean, false) then
    for r in select key, value from jsonb_each_text(coalesce(new.data->'due', '{}'::jsonb)) loop
      perform public.push_send('zahltag', array[r.key], null, '💶 Zahltag',
        public.eur_txt(public.num_or0(r.value)) || ' bis ' || public.berlin_txt(new.data->>'endsAt') || ' zahlen', 'zahltag');
    end loop;
  end if;
  return null;
exception when others then raise warning 'push_zahltag_ins: %', sqlerrm; return null;
end $$;
drop trigger if exists push_zahltag_ins on public.zahltag;
create trigger push_zahltag_ins after insert on public.zahltag for each row execute function public.push_zahltag_ins();

-- Neues Fußballspiel → alle
create or replace function public.push_fussball_ins() returns trigger
language plpgsql security definer set search_path = public as $$
declare j int := coalesce((new.data->>'jung')::int, 0); a int := coalesce((new.data->>'alt')::int, 0);
begin
  perform public.push_send('fussball', null, null, '⚽ Neues Spiel',
    'Jung ' || j || ' : ' || a || ' Alt', 'fussball');
  return null;
exception when others then raise warning 'push_fussball_ins: %', sqlerrm; return null;
end $$;
drop trigger if exists push_fussball_ins on public.fussball;
create trigger push_fussball_ins after insert on public.fussball for each row execute function public.push_fussball_ins();

-- Spieler meldet „Ich habe bezahlt“ → Kassenwart und Admin (aufgerufen aus report_self_paid)
create or replace function public.push_meldung(pid text) returns void
language plpgsql security definer set search_path = public as $$
declare s numeric; nm text;
begin
  select coalesce(sum(public.num_or0(data->>'amount')), 0) into s from public.entries
   where data->>'playerId' = pid and coalesce((data->>'reported')::boolean, false) and not coalesce((data->>'paid')::boolean, false);
  select data->>'name' into nm from public.players where id = pid;
  perform public.push_send('meldung', null, array['kassenwart', 'admin'], '💸 Zahlung gemeldet',
    coalesce(nm, 'Jemand') || ' · ' || public.eur_txt(s) || ' – bitte bestätigen', 'meldung');
exception when others then raise warning 'push_meldung: %', sqlerrm;
end $$;

-- Stündlicher Takt (pg_cron): Dienstag 17 Uhr Döner-Erinnerung, täglich 18 Uhr Zahltag-Erinnerung (endet in < 24 h)
create or replace function public.push_tick() returns void
language plpgsql security definer set search_path = public as $$
declare n timestamp := now() at time zone 'Europe/Berlin'; w text; c int; z record; r record; rest numeric;
begin
  delete from public.push_verlauf where at < now() - interval '30 days';
  -- Dienstag 12 Uhr: alle daran erinnern, dass heute bis 18 Uhr bestellt wird
  if extract(isodow from n) = 2 and extract(hour from n) = 12 then
    perform public.push_send('doener', null, null, '🥙 Heute Döner bestellen', 'Bis 18 Uhr eintragen', 'doener');
  end if;
  if extract(isodow from n) = 2 and extract(hour from n) = 17 then
    w := to_char(n::date, 'YYYY-MM-DD');
    select count(*) into c from public.doener where data->>'week' = w;
    perform public.push_send('doener',
      array(select m.player_id from public.members m where m.approved and m.player_id is not null
              and not exists (select 1 from public.doener d where d.id = w || '_' || m.player_id)),
      null, '🥙 Döner bis 18 Uhr', 'Du hast noch nicht bestellt', 'doener');
  end if;
  -- Mittwoch 12 Uhr: wer am gestrigen Dienstag Döner bestellt hat, noch nicht abgehakt ist und noch nicht „Ich habe bezahlt“ gemeldet hat
  if extract(isodow from n) = 3 and extract(hour from n) = 12 then
    w := to_char(n::date - 1, 'YYYY-MM-DD');
    perform public.push_send('doener',
      array(select d.data->>'pid' from public.doener d where d.data->>'week' = w and not coalesce((d.data->>'paid')::boolean, false) and not (d.data ? 'reportedAt')),
      null, '🥙 Döner noch offen', 'Bitte den Döner von gestern bezahlen', 'doener-erinnerung');
  end if;
  if extract(hour from n) = 9 then
    perform public.geburtstag_tick(n::date);
  end if;
  -- Berichte: Sonntag vor der Abgabe um 12 Uhr, am Abgabetag um 9 Uhr
  if extract(isodow from n) = 7 and extract(hour from n) = 12 then
    perform public.bericht_tick(n::date, false);
  end if;
  if extract(hour from n) = 9 then
    perform public.bericht_tick(n::date, true);
  end if;
  if extract(hour from n) = 18 then
    for z in select data from public.zahltag
              where coalesce((data->>'active')::boolean, false)
                and (data->>'endsAt')::timestamptz > now() and (data->>'endsAt')::timestamptz <= now() + interval '24 hours' loop
      for r in select key from jsonb_each(coalesce(z.data->'due', '{}'::jsonb)) loop
        select coalesce(sum(public.num_or0(e.data->>'amount') - public.num_or0(e.data->>'creditUsed')), 0) into rest from public.entries e
         where e.id in (select jsonb_array_elements_text(coalesce(z.data->'entryIds', '[]'::jsonb)))
           and e.data->>'playerId' = r.key
           and not coalesce((e.data->>'paid')::boolean, false) and not coalesce((e.data->>'reported')::boolean, false);
        if rest > 0 then
          perform public.push_send('zahltag', array[r.key], null, '⏰ Zahltag endet bald',
            'Noch ' || public.eur_txt(rest) || ' offen – bis ' || public.berlin_txt(z.data->>'endsAt') || ' zahlen', 'zahltag-erinnerung');
        end if;
      end loop;
    end loop;
  end if;
exception when others then raise warning 'push_tick: %', sqlerrm;
end $$;

-- Test-Benachrichtigung an die eigenen Geräte (Knopf in der App)
create or replace function public.push_test() returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'Nicht freigeschaltet'; end if;
  if not exists (select 1 from public.push_config where id = 1 and vapid_public is not null) then
    perform public.push_post(jsonb_build_object('init', true));
    raise exception 'Push ist noch nicht eingerichtet';
  end if;
  return public.push_send('test', null, null, '🐉 Dragons Kasse', 'Benachrichtigungen funktionieren!', 'test', auth.uid());
end $$;

revoke execute on function public.push_post(jsonb), public.push_send(text, text[], text[], text, text, text, uuid), public.push_entries_ins(),
  public.push_zahltag_ins(), public.push_fussball_ins(), public.push_meldung(text), public.push_tick() from public, anon, authenticated;
revoke execute on function public.push_test() from public, anon;
grant execute on function public.push_test() to authenticated;

-- Öffentlicher VAPID-Schlüssel für die App (zum Anmelden eines Geräts). Fehlt er noch, wird die Einrichtung angestoßen.
create or replace function public.push_vapid_key() returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not public.is_member() then return null; end if;
  select vapid_public into k from public.push_config where id = 1;
  if k is null then perform public.push_post(jsonb_build_object('init', true)); end if;
  return k;
end $$;
revoke execute on function public.push_vapid_key() from public, anon;
grant execute on function public.push_vapid_key() to authenticated;

-- Dienstag 19:00 und 19:15 Uhr (deutsche Zeit): Erinnerung an den Dönerwart, die Döner zu bestellen (nur wenn jemand bestellt hat).
-- pg_cron rechnet in UTC; der Zeitplan läuft deshalb um 17 und 18 Uhr UTC, und die Funktion prüft selbst, ob es in Deutschland 19 Uhr ist.
create or replace function public.doener_wart_tick() returns void
language plpgsql security definer set search_path = public as $$
declare n timestamp := now() at time zone 'Europe/Berlin'; c int;
begin
  if extract(isodow from n) <> 2 or extract(hour from n) <> 19 or extract(minute from n) >= 30 then return; end if;
  select count(*) into c from public.doener where data->>'week' = to_char(n::date, 'YYYY-MM-DD');
  if c = 0 then return; end if;
  perform public.push_send('doener', null, array['doenerwart'],
    case when extract(minute from n) < 15 then '🥙 Döner bestellen' else '🥙 Erinnerung: Döner bestellen' end,
    case when c = 1 then '1 Bestellung' else c || ' Bestellungen' end || ' – jetzt bestellen', 'doener-wart');
exception when others then raise warning 'doener_wart_tick: %', sqlerrm;
end $$;
revoke execute on function public.doener_wart_tick() from public, anon, authenticated;

do $$ begin
  perform cron.schedule('dragons-push', '0 * * * *', 'select public.push_tick()');
  perform cron.schedule('dragons-doener', '0,15 17,18 * * 2', 'select public.doener_wart_tick()');
exception when others then raise notice 'pg_cron-Zeitplan nicht angelegt: %', sqlerrm;
end $$;

-- ---------- Geburtsdaten für „Trikots“ (Spieler nach Alter) ----------
-- Bewusst NICHT in der Tabelle players: die dürfen auch noch nicht freigeschaltete Konten lesen.
-- Trikots sind vorerst nur für Kassenwart und Admin: nur sie sehen und ändern Geburtsdaten.
-- Trikotwart: als Einziger darf er bei „Trikots“ etwas ändern (Geburtsdaten, Wäsche). Sehen dürfen Kassenwart, Admin und Trikotwart.
create or replace function public.is_trikotwart() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_role('trikotwart') $$;
revoke execute on function public.is_trikotwart() from public, anon;
grant execute on function public.is_trikotwart() to authenticated;
create table if not exists public.geburt (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now(),
  constraint geburt_datum check (data->>'date' ~ '^\d{4}-\d{2}-\d{2}$'));
alter table public.geburt enable row level security;
drop policy if exists geburt_read on public.geburt;
create policy geburt_read on public.geburt for select using (public.can_book() or public.is_trikotwart());
drop policy if exists geburt_ins on public.geburt;
create policy geburt_ins on public.geburt for insert with check (public.is_trikotwart());
drop policy if exists geburt_upd on public.geburt;
create policy geburt_upd on public.geburt for update using (public.is_trikotwart()) with check (public.is_trikotwart());
drop policy if exists geburt_del on public.geburt;
create policy geburt_del on public.geburt for delete using (public.is_trikotwart());
do $$ begin alter publication supabase_realtime add table public.geburt; exception when duplicate_object then null; end $$;

-- ---------- Trikots gewaschen ----------
-- Vorerst nur für Kassenwart und Admin (sehen und eintragen).
create table if not exists public.trikotwash (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now(),
  constraint trikotwash_form check (jsonb_typeof(data->'log') = 'array' and jsonb_array_length(data->'log') <= 20 and length(data::text) < 4000));
alter table public.trikotwash enable row level security;
drop policy if exists trikotwash_read on public.trikotwash;
create policy trikotwash_read on public.trikotwash for select using (public.can_book() or public.is_trikotwart());
drop policy if exists trikotwash_ins on public.trikotwash;
create policy trikotwash_ins on public.trikotwash for insert with check (public.is_trikotwart());
drop policy if exists trikotwash_upd on public.trikotwash;
create policy trikotwash_upd on public.trikotwash for update using (public.is_trikotwart()) with check (public.is_trikotwart());
drop policy if exists trikotwash_del on public.trikotwash;
create policy trikotwash_del on public.trikotwash for delete using (public.is_trikotwart());
do $$ begin alter publication supabase_realtime add table public.trikotwash; exception when duplicate_object then null; end $$;

-- ---------- Kalender: Trainingszeiten und Spiele ----------
-- Alle freigeschalteten Mitglieder sehen die Termine. Eintragen, ändern und löschen dürfen nur Trainer (Rolle „trainer“) und Admin, der Kassenwart nicht.
-- type 'usual' = übliche Trainingszeiten pro Wochentag (wd 0 = Montag); 'cancel' = Tag ohne Training (verhindert, dass die üblichen Zeiten wieder erscheinen); 'plan' = Merker „Wochenplan gesendet“; 'baelle' = wer an diesem Donnerstag die Bälle entharzt (pids, doneAt, doneBy).
-- Die Spiele der Saison stehen in supabase/seed-spiele.sql (lokal, nicht im Repo).
create or replace function public.can_termine() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_role('trainer') or public.has_role('admin') $$;
create table if not exists public.termine (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now());
-- Form der Termine; plan-<mon> darf größer sein (gemeldeter Stand je Tag in data.days)
alter table public.termine drop constraint if exists termine_form;
alter table public.termine add constraint termine_form check (coalesce(length(data::text) < case when data->>'type' = 'plan' then 4000 else 1000 end and ((data->>'type' in ('training','spiel','cancel') and data->>'date' ~ '^\d{4}-\d{2}-\d{2}$') or (data->>'type' = 'usual' and data->>'wd' ~ '^[0-6]$') or (data->>'type' = 'plan' and data->>'mon' ~ '^\d{4}-\d{2}-\d{2}$') or (data->>'type' = 'baelle' and data->>'date' ~ '^\d{4}-\d{2}-\d{2}$' and jsonb_typeof(data->'pids') = 'array')), false));
alter table public.termine enable row level security;
drop policy if exists termine_read on public.termine;
create policy termine_read on public.termine for select using (public.is_member());
drop policy if exists termine_ins on public.termine;
create policy termine_ins on public.termine for insert with check (public.can_termine() and (data->>'type' <> 'baelle' or public.is_admin()));
drop policy if exists termine_upd on public.termine;
create policy termine_upd on public.termine for update using (public.can_termine() and (data->>'type' <> 'baelle' or public.is_admin())) with check (public.can_termine() and (data->>'type' <> 'baelle' or public.is_admin()));
drop policy if exists termine_del on public.termine;
create policy termine_del on public.termine for delete using (public.can_termine() and (data->>'type' <> 'baelle' or public.is_admin()));
do $$ begin alter publication supabase_realtime add table public.termine; exception when duplicate_object then null; end $$;
-- Mannschaftsverantwortlicher: darf bei Spielen NUR den Treffpunkt eintragen (über diese Funktion, nicht direkt in die Tabelle)
create or replace function public.is_mv() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_role('mannschaftsverantwortlicher') $$;
-- Treffpunkt (Uhrzeit, Ort) und Anreise (freier Text, z. B. Fahrgemeinschaften, Bus) für ein Spiel
drop function if exists public.termin_treffpunkt(text, text, text);
create or replace function public.termin_treffpunkt(doc_id text, meet text, meet_place text, travel text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.can_termine() or public.is_mv()) then raise exception 'Keine Berechtigung'; end if;
  if coalesce(meet, '') <> '' and meet !~ '^\d{2}:\d{2}$' then raise exception 'Ungültige Uhrzeit'; end if;
  update public.termine
     set data = data || jsonb_build_object('meet', nullif(meet, ''), 'meetPlace', nullif(left(coalesce(meet_place, ''), 120), ''),
                                           'travel', nullif(left(coalesce(travel, ''), 300), '')), updated_at = now()
   where id = doc_id and data->>'type' = 'spiel';
end $$;
-- „Fertig“: eine einzige Benachrichtigung „Wochenplan“ an alle (statt einer pro Eintrag). Der Text wird hier aus den Terminen der Woche
-- gebaut (kein freier Text vom Aufrufer). Merkt sich, wann sie gesendet wurde.
drop function if exists public.wochenplan_senden(text, text);
-- Text des Wochenplans je Tag: {"2026-11-23": "19:45–22:00 Kraft + Halle · Spiel 19:30 …", …}, je Tag höchstens 300 Zeichen.
-- Gleiche Regel wie termineAt() in app.js: übliche Zeiten zählen ab heute, solange der Tag weder ein Training noch eine Absage hat.
create or replace function public.wochenplan_tage(mon text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date; i int; r record; u record; t time; mt text; dl text[]; days jsonb := '{}'; today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if mon is null or mon !~ '^\d{4}-\d{2}-\d{2}$' or extract(isodow from mon::date) <> 1 then raise exception 'Ungültige Woche'; end if;
  for i in 0..6 loop
    d := mon::date + i; dl := '{}';
    for r in select data from public.termine where data->>'type' in ('training', 'spiel') and data->>'date' = d::text order by data->>'start', data->>'type' loop
      if r.data->>'type' = 'spiel' then
        mt := '';
        if d >= today then
          if coalesce((r.data->>'home')::boolean, true) then
            if nullif(r.data->>'start', '') is not null then
              t := (r.data->>'start')::time - interval '90 minutes';
              mt := ' – Treffpunkt ' || to_char(t, 'HH24:MI') || ' Uhr';
            end if;
          elsif nullif(r.data->>'meet', '') is not null then
            mt := ' – Treffpunkt ' || (r.data->>'meet') || ' Uhr' || coalesce(' · ' || nullif(r.data->>'meetPlace', ''), '');
          else
            mt := ' – Treffpunkt folgt';
          end if;
        end if;
        if d >= today and nullif(r.data->>'travel', '') is not null then mt := mt || ' – Anreise: ' || left(regexp_replace(r.data->>'travel', '\s+', ' ', 'g'), 80); end if; -- Zeilenumbrüche würden den Wochenplan zerreißen
        dl := dl || ('Spiel ' || coalesce(r.data->>'start', '') || ' ' || coalesce(r.data->>'title', '') || mt);
      else
        dl := dl || (coalesce(r.data->>'start', '') || '–' || coalesce(r.data->>'end', '') || ' ' || coalesce(nullif(r.data->>'title', ''), 'Training'));
      end if;
    end loop;
    if d >= today and not exists (select 1 from public.termine where data->>'type' in ('training', 'cancel') and data->>'date' = d::text) then
      for u in select data from public.termine where data->>'type' = 'usual' and data->>'wd' = i::text order by data->>'start' loop
        dl := dl || ((u.data->>'start') || '–' || (u.data->>'end') || ' ' || coalesce(nullif(u.data->>'title', ''), 'Training'));
      end loop;
    end if;
    days := days || jsonb_build_object(d::text, left(array_to_string(dl, ' · '), 300));
  end loop;
  return days;
end $$;
create or replace function public.wd_kurz(d date) returns text
language sql immutable as $$ select (array['Mo','Di','Mi','Do','Fr','Sa','So'])[extract(isodow from d)::int] || ' ' || to_char(d, 'DD.MM') $$;
-- Tage ab heute, die sich seit der letzten Meldung geändert haben: [{"d": "2026-11-25", "t": "Mi 25.11: 18:00–19:30 Halle (statt …)"}, …].
-- null = Woche noch nie mit Tagesstand gemeldet.
drop function if exists public.wochenplan_aenderungen(text, jsonb);
create function public.wochenplan_aenderungen(mon text, tage jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare old jsonb; d date; cur text; prev text; chg jsonb := '[]'; today date := (now() at time zone 'Europe/Berlin')::date;
begin
  select data->'days' into old from public.termine where id = 'plan-' || mon and data->>'type' = 'plan';
  if old is null then return null; end if;
  for d in select generate_series(greatest(mon::date, today), mon::date + 6, interval '1 day')::date loop
    cur := tage->>(d::text); prev := nullif(old->>(d::text), '');
    if coalesce(prev, '') <> cur then
      chg := chg || jsonb_build_object('d', d::text, 't', public.wd_kurz(d) || ': ' || coalesce(nullif(cur, ''), 'fällt aus') || coalesce(' (statt ' || prev || ')', ''));
    end if;
  end loop;
  return chg;
end $$;
-- Für den Knopf im Kalender: gibt es etwas zu melden? (noch nie gemeldet = ja)
create or replace function public.wochenplan_geaendert(mon text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare c jsonb;
begin
  if not (public.can_termine() or public.is_mv()) then raise exception 'Keine Berechtigung'; end if;
  c := public.wochenplan_aenderungen(mon, public.wochenplan_tage(mon));
  return c is null or jsonb_array_length(c) > 0;
end $$;
-- Erste Meldung einer Woche: „Neue Woche“ mit den Uhrzeiten (Mo 19:45 · Sa Spiel 18:00). Danach nur die geänderten Tage.
-- plan-<mon> merkt sich den gemeldeten Stand je Tag (days), die Art (kind: neu/aenderung) und wann welcher Tag zuletzt geändert gemeldet wurde
-- (changedAt, sammelt sich bis zur nächsten „Neuen Woche“) – daraus setzt die App die roten Punkte an den Tagen.
create or replace function public.wochenplan_senden(mon text) returns int
language plpgsql security definer set search_path = public as $$
declare n int; nm text; tage jsonb; chg jsonb; body text; jetzt text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); ca jsonb;
begin
  if not (public.can_termine() or public.is_mv()) then raise exception 'Keine Berechtigung'; end if;
  tage := public.wochenplan_tage(mon);
  chg := public.wochenplan_aenderungen(mon, tage);
  if jsonb_array_length(chg) = 0 then raise exception 'Seit der letzten Meldung hat sich nichts geändert'; end if;
  ca := case when chg is null then '{}'::jsonb else coalesce((select data->'changedAt' from public.termine where id = 'plan-' || mon), '{}')
                || (select jsonb_object_agg(x->>'d', jetzt) from jsonb_array_elements(chg) x) end;
  select data->>'name' into nm from public.players where id = public.my_pid();
  if chg is null then
    body := coalesce((select string_agg(left(public.wd_kurz(k::date), 2) || ' ' || z, ' · ' order by k)
      from (select k, (select string_agg(substring(x from '^(?:Spiel )?\d\d:\d\d') || coalesce(' (Treffpunkt ' || substring(x from '^Spiel .* – Treffpunkt (\d\d:\d\d)') || ')', ''), ' + ') from regexp_split_to_table(v, ' · ') x where x ~ '^(Spiel )?\d\d:\d\d') z
              from jsonb_each_text(tage) e(k, v)) y where z is not null), 'Diese Woche ist nichts geplant');
    n := public.push_send('plan', null, null, '📅 Neue Woche · KW ' || to_char(mon::date, 'IW'), body, 'wochenplan');
  else
    body := left((select string_agg(x->>'t', E'\n') from jsonb_array_elements(chg) x), 400);
    n := public.push_send('plan', null, null, case when jsonb_array_length(chg) = 1 then '📅 Termin geändert' else '📅 ' || jsonb_array_length(chg) || ' Termine geändert' end, body, 'wochenplan-aenderung');
  end if;
  insert into public.termine (id, data)
    values ('plan-' || mon, jsonb_build_object('type', 'plan', 'mon', mon, 'sentAt', jetzt, 'by', nm, 'days', tage,
      'kind', case when chg is null then 'neu' else 'aenderung' end, 'changedAt', ca))
  on conflict (id) do update set data = excluded.data, updated_at = now();
  return n;
end $$;
-- Bälle entharzen: die eingeteilten Personen (und der Admin) melden den Donnerstag als erledigt. Den Plan ändert nur der Admin (Tabelle termine).
create or replace function public.baelle_erledigt(d text) returns void
language plpgsql security definer set search_path = public as $$
declare pid text := public.my_pid();
begin
  if not (public.is_admin() or (pid is not null and exists (select 1 from public.termine where id = 'baelle-' || d and data->'pids' ? pid))) then
    raise exception 'Keine Berechtigung';
  end if;
  update public.termine
     set data = data || jsonb_build_object('doneAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'doneBy', (select data->>'name' from public.players where id = pid)), updated_at = now()
   where id = 'baelle-' || d and data->>'type' = 'baelle';
end $$;
-- Bälle-Plan ändern (nur Admin): alle Wochen einer Änderung in einem Schritt – klappt eine nicht, wird nichts gespeichert.
-- changes = [{id, pids, pinned?}, …]; erledigte Wochen bleiben unverändert.
create or replace function public.baelle_speichern(changes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  if not public.is_admin() then raise exception 'Nur der Admin darf den Plan ändern'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 100 then raise exception 'Ungültige Änderung'; end if;
  for c in select * from jsonb_array_elements(changes) loop
    if jsonb_typeof(c->'pids') <> 'array' or jsonb_array_length(c->'pids') not between 1 and 10
       or exists (select 1 from jsonb_array_elements(c->'pids') e where jsonb_typeof(e) <> 'string') then
      raise exception 'Ungültige Personen';
    end if;
    update public.termine
       set data = data || jsonb_build_object('pids', c->'pids') || case when coalesce((c->>'pinned')::boolean, false) then '{"pinned": true}'::jsonb else '{}'::jsonb end,
           updated_at = now()
     where id = c->>'id' and data->>'type' = 'baelle' and data->>'doneAt' is null;
    if not found then raise exception 'Woche % gibt es nicht oder sie ist schon erledigt', c->>'id'; end if;
  end loop;
end $$;
revoke execute on function public.baelle_speichern(jsonb) from public, anon;
grant execute on function public.baelle_speichern(jsonb) to authenticated;
revoke execute on function public.can_termine(), public.is_mv(), public.termin_treffpunkt(text, text, text, text), public.wochenplan_senden(text), public.wochenplan_geaendert(text), public.baelle_erledigt(text) from public, anon;
revoke execute on function public.wochenplan_tage(text), public.wochenplan_aenderungen(text, jsonb), public.wd_kurz(date) from public, anon, authenticated;
grant execute on function public.can_termine(), public.is_mv(), public.termin_treffpunkt(text, text, text, text), public.wochenplan_senden(text), public.wochenplan_geaendert(text), public.baelle_erledigt(text) to authenticated;

-- ---------- Geburtstage (Tag und Monat) ----------
-- Für alle freigeschalteten Mitglieder sichtbar; eintragen dürfen Kassenwart und Admin.
-- Die echten Daten kommen NICHT ins Repo (supabase/seed-geburtstage.sql ist in .gitignore).
create table if not exists public.geburtstage (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now(),
  constraint geburtstage_md check (data->>'md' ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'));
alter table public.geburtstage enable row level security;
drop policy if exists geburtstage_read on public.geburtstage;
create policy geburtstage_read on public.geburtstage for select using (public.is_member());
drop policy if exists geburtstage_ins on public.geburtstage;
create policy geburtstage_ins on public.geburtstage for insert with check (public.can_book());
drop policy if exists geburtstage_upd on public.geburtstage;
create policy geburtstage_upd on public.geburtstage for update using (public.can_book()) with check (public.can_book());
drop policy if exists geburtstage_del on public.geburtstage;
create policy geburtstage_del on public.geburtstage for delete using (public.can_book());
do $$ begin alter publication supabase_realtime add table public.geburtstage; exception when duplicate_object then null; end $$;

-- Am Geburtstag (aufgerufen von push_tick um 9 Uhr deutscher Zeit): Kabinenfest eintragen + Glückwünsche + Info an alle anderen.
-- 29.02. wird in Nicht-Schaltjahren am 28.02. gefeiert. Feste ID kf-gb-<Spieler>-<Jahr>: nie doppelt.
-- Wer keine Geburtstags-Nachrichten bekommen soll, steht in kasse_intern 'push_stumm' (data.geburtstag = Liste von Spieler-IDs, lokal in seed-geburtstage.sql).
create or replace function public.geburtstag_tick(d date) returns void
language plpgsql security definer set search_path = public as $$
declare r record; md text := to_char(d, 'MM-DD'); y text := to_char(d, 'YYYY');
  stumm text[] := array(select jsonb_array_elements_text(coalesce((select data->'geburtstag' from public.kasse_intern where id = 'push_stumm'), '[]')));
  leap boolean := (extract(year from d)::int % 4 = 0 and (extract(year from d)::int % 100 <> 0 or extract(year from d)::int % 400 = 0));
begin
  -- nur aktive Personen, die es noch im Kader gibt
  for r in select g.id as pid, coalesce(p.data->>'name', 'Jemand') as nm
             from public.geburtstage g join public.players p on p.id = g.id and coalesce((p.data->>'active')::boolean, true)
            where g.data->>'md' = md or (not leap and md = '02-28' and g.data->>'md' = '02-29') loop
    begin
      -- Merker: ein Geburtstags-Kabinenfest pro Person und Jahr, auch wenn es danach gelöscht wird
      if not exists (select 1 from public.kasse_intern where id = 'gb_done' and data ? (r.pid || '-' || y)) then
      insert into public.entries (id, data) values ('kf-gb-' || r.pid || '-' || y, jsonb_build_object(
        'playerId', r.pid, 'fineId', 'kf-manual', 'title', 'Geburtstag', 'amount', 0, 'col', 'strafen', 'spieltag', false,
        'kabinenfest', true, 'kfDone', false, 'note', 'Geburtstag am ' || to_char(d, 'DD.MM.YYYY'), 'date', to_char(d, 'YYYY-MM-DD'),
        'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'paid', false, 'auto', 'geburtstag'))
      on conflict (id) do nothing;
      insert into public.kasse_intern (id, data) values ('gb_done', jsonb_build_object(r.pid || '-' || y, true))
      on conflict (id) do update set data = public.kasse_intern.data || excluded.data, updated_at = now();
      end if;
    exception when others then raise warning 'geburtstag_tick Kabinenfest: %', sqlerrm;
    end;
    if r.pid <> all(stumm) then
      perform public.push_send('geburtstag', array[r.pid], null, '🎉 Alles Gute zum Geburtstag!',
        'Die Mannschaft gratuliert, ' || split_part(r.nm, ' ', 1) || '! 🐉', 'gb-' || r.pid);
    end if;
    perform public.push_send('geburtstag',
      array(select m.player_id from public.members m where m.approved and m.player_id is not null and m.player_id <> r.pid and m.player_id <> all(stumm)),
      null, '🎂 ' || r.nm || ' hat Geburtstag', 'Gratulier kurz in der Gruppe', 'gb-' || r.pid);
  end loop;
exception when others then raise warning 'geburtstag_tick: %', sqlerrm;
end $$;
revoke execute on function public.geburtstag_tick(date) from public, anon, authenticated;

-- ---------- Schulden (Notizliste nur für den Kassenwart) ----------
-- Name, Betrag, abgehakt. Sehen und ändern darf das ausschließlich der Kassenwart (auch nicht der Admin).
create table if not exists public.schulden (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now(),
  constraint schulden_form check (length(data::text) < 1000 and length(coalesce(data->>'name', '')) between 1 and 80 and public.num_or0(data->>'amount') >= 0));
alter table public.schulden enable row level security;
drop policy if exists schulden_all on public.schulden;
create policy schulden_all on public.schulden for all using (public.is_kw()) with check (public.is_kw());
do $$ begin alter publication supabase_realtime add table public.schulden; exception when duplicate_object then null; end $$;

-- ---------- Jeder Name nur einmal ----------
-- Bei der Registrierung darf man nur einen Spieler wählen, den noch kein anderes Konto gewählt hat.
do $$ begin
  if exists (select 1 from public.members where player_id is not null group by player_id having count(*) > 1) then
    raise notice 'members: ein Spieler ist mehreren Konten zugeordnet – Eindeutigkeit wird erst nach dem Aufräumen angelegt';
  else
    create unique index if not exists members_player_once on public.members (player_id);
  end if;
end $$;
-- welche Spieler schon vergeben sind (nur die IDs, keine E-Mail-Adressen) – für die Namensauswahl bei der Registrierung
create or replace function public.taken_players() returns setof text
language sql stable security definer set search_path = public as $$
  select player_id from public.members where player_id is not null and auth.uid() is not null
$$;
revoke execute on function public.taken_players() from public, anon;
grant execute on function public.taken_players() to authenticated;

-- ---------- Berichte fürs Hallenheft (Lage der Liga, Grußwort) ----------
-- Pro Heimspiel: date, spieltag, gegner, lage (Spieler-ID), gruss (Spieler-ID), abgabe (Datum). Alle sehen den Plan; ändern lässt er sich in der App nicht.
-- Der Plan steht in supabase/seed-berichte.sql (lokal, nicht im Repo).
create table if not exists public.berichte (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now(),
  constraint berichte_form check (length(data::text) < 1000 and data->>'date' ~ '^\d{4}-\d{2}-\d{2}$' and coalesce(data->>'abgabe', '2000-01-01') ~ '^\d{4}-\d{2}-\d{2}$'));
alter table public.berichte enable row level security;
drop policy if exists berichte_read on public.berichte;
create policy berichte_read on public.berichte for select using (public.is_member());
drop policy if exists berichte_write on public.berichte;
do $$ begin alter publication supabase_realtime add table public.berichte; exception when duplicate_object then null; end $$;

-- Erinnerung an die Schreiber (aus push_tick): am Sonntag vor der Abgabe um 12 Uhr und am Abgabetag um 9 Uhr.
-- Beispiel: Heimspiel 28.11., Abgabe Mo 23.11. → So 22.11. 12 Uhr und Mo 23.11. 9 Uhr. Ohne Abgabedatum keine Erinnerung.
drop function if exists public.bericht_tick(date);
create or replace function public.bericht_tick(d date, abgabetag boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r record; k text; a date;
begin
  for r in select id, data from public.berichte where coalesce(data->>'abgabe', '') ~ '^\d{4}-\d{2}-\d{2}$' and data->>'date' ~ '^\d{4}-\d{2}-\d{2}$' loop
    begin a := (r.data->>'abgabe')::date; perform (r.data->>'date')::date; exception when others then continue; end; -- ungültiges Datum: nur diese Zeile überspringen
    -- Sonntag vor der Abgabe (ist die Abgabe selbst ein Sonntag, der Sonntag eine Woche davor)
    continue when not (case when abgabetag then d = a else d = a - (case when extract(isodow from a)::int = 7 then 7 else extract(isodow from a)::int end) end);
    foreach k in array array['lage', 'gruss'] loop
      if nullif(r.data->>k, '') is not null then
        perform public.push_send('bericht', array[r.data->>k], null,
          case when abgabetag then '📝 Heute Abgabe: Bericht' else '📝 Bericht schreiben' end,
          case k when 'lage' then 'Lage der Liga' else 'Grußwort' end || ' · gegen ' || coalesce(r.data->>'gegner', '?')
          || case when abgabetag then ' · heute abgeben' else ' · Abgabe ' || to_char(a, 'DD.MM.') end, 'bericht-' || r.id);
      end if;
    end loop;
  end loop;
exception when others then raise warning 'bericht_tick: %', sqlerrm;
end $$;
revoke execute on function public.bericht_tick(date, boolean) from public, anon, authenticated;

-- ---------- Anzeigen: Spieler melden einen Verstoß (mit Foto), der Kassenwart trägt die Strafe ein oder lehnt ab ----------
-- data: uid, by (Spieler-ID des Anzeigenden), playerId (angezeigt), nr (gesuchte Nummer, freiwillig), fineId, title, amount, qty/unit (Menge je Person, z. B. Minuten), note, path (Foto im Bucket „anzeigen“), status neu|ok|nein, createdAt.
-- Offene Anzeigen (mit Foto) sehen alle Mitglieder – so zeigt niemand dasselbe doppelt an. Erledigte sehen nur Kassenwart, Admin und wer sie erstattet hat.
-- Jede Strafe aus dem Katalog ist erlaubt, auch sich selbst; mehrere Angezeigte = eine Anzeige pro Person mit demselben Foto.
create table if not exists public.anzeigen (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now(),
  constraint anzeigen_form check (length(data::text) < 2000 and coalesce(data->>'status', 'neu') in ('neu', 'ok', 'nein')));
alter table public.anzeigen enable row level security;
drop policy if exists anzeigen_read on public.anzeigen;
create policy anzeigen_read on public.anzeigen for select using (public.can_book() or (public.is_member() and (data->>'uid' = auth.uid()::text or coalesce(data->>'status', 'neu') = 'neu')));
drop policy if exists anzeigen_ins on public.anzeigen;
create policy anzeigen_ins on public.anzeigen for insert with check (
  public.is_member() and data->>'uid' = auth.uid()::text and coalesce(data->>'status', 'neu') = 'neu'
  and data->>'by' is not distinct from public.my_pid() and nullif(data->>'playerId', '') is not null
  and (data->>'nr' is null or data->>'nr' ~ '^\d{1,3}$') -- gesuchte Nummer (z. B. von der Flasche), freiwillig
  and (data->>'qty' is null or data->>'qty' ~ '^\d{1,3}$') and length(coalesce(data->>'unit', '')) <= 20 -- Menge je Person (z. B. Minuten)
  and exists (select 1 from public.fines f where f.id = anzeigen.data->>'fineId') -- jede Strafe aus dem Katalog
  and (data->>'path' is null or data->>'path' like auth.uid()::text || '/%'));
drop policy if exists anzeigen_upd on public.anzeigen;
create policy anzeigen_upd on public.anzeigen for update using (public.can_book()) with check (public.can_book());
drop policy if exists anzeigen_del on public.anzeigen;
create policy anzeigen_del on public.anzeigen for delete using (public.can_book() or (data->>'uid' = auth.uid()::text and coalesce(data->>'status', 'neu') = 'neu'));
do $$ begin alter publication supabase_realtime add table public.anzeigen; exception when duplicate_object then null; end $$;
-- Fotos: privat, max. 5 MB, nur Bilder; Pfad immer <user-id>/<datei>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anzeigen', 'anzeigen', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists anzeigen_foto_read on storage.objects;
create policy anzeigen_foto_read on storage.objects for select using (bucket_id = 'anzeigen' and (public.can_book() or (storage.foldername(name))[1] = auth.uid()::text
  or (public.is_member() and exists (select 1 from public.anzeigen a where a.data->>'path' = name and coalesce(a.data->>'status', 'neu') = 'neu')))); -- Foto einer offenen Anzeige: alle
drop policy if exists anzeigen_foto_ins on storage.objects;
create policy anzeigen_foto_ins on storage.objects for insert with check (bucket_id = 'anzeigen' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists anzeigen_foto_del on storage.objects;
create policy anzeigen_foto_del on storage.objects for delete using (bucket_id = 'anzeigen' and (public.can_book() or (storage.foldername(name))[1] = auth.uid()::text));
-- Neue Anzeige → Push an den Kassenwart
create or replace function public.push_anzeige_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_send('anzeige', null, array['kassenwart'], '📸 Neue Anzeige',
    coalesce((select data->>'name' from public.players where id = new.data->>'by'), 'Jemand') || ' zeigt '
    || coalesce((select data->>'name' from public.players where id = new.data->>'playerId'), 'jemanden') || ' an · '
    || coalesce(new.data->>'title', 'Strafe'), 'anzeige');
  return null;
exception when others then raise warning 'push_anzeige_ins: %', sqlerrm; return null;
end $$;
drop trigger if exists push_anzeige_ins on public.anzeigen;
create trigger push_anzeige_ins after insert on public.anzeigen for each row execute function public.push_anzeige_ins();
revoke execute on function public.push_anzeige_ins() from public, anon, authenticated;

-- ---------- Neue Anmeldung → Push an den Admin ----------
-- Sobald ein neues Konto seinen Namen gewählt hat (Zeile in members, noch nicht freigeschaltet).
create or replace function public.push_member_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.approved then
    perform public.push_send('anmeldung', null, array['admin'], '👤 Neue Anmeldung',
      coalesce((select data->>'name' from public.players where id = new.player_id), 'Jemand') || ' wartet auf Freischaltung', 'anmeldung-' || new.user_id); -- gleiche Person ersetzt die alte Nachricht
  end if;
  return null;
exception when others then raise warning 'push_member_ins: %', sqlerrm; return null;
end $$;
drop trigger if exists push_member_ins on public.members;
create trigger push_member_ins after insert on public.members for each row execute function public.push_member_ins();
revoke execute on function public.push_member_ins() from public, anon, authenticated;

-- ---------- Kabinenfestwart: Kabinenfeste eintragen, abhaken, einplanen, Reihenfolge ändern ----------
-- Er darf nur reine Kabinenfeste ohne Betrag anlegen (kf-manual, 0 €), eigene noch offene davon wieder löschen und bei Kabinenfest-Einträgen nur kfDone, kfOrder und kfWeek ändern.
-- An Strafbeträge, Bezahlt-Status und alles andere kommt er nicht.
drop policy if exists entries_kfw_ins on public.entries;
create policy entries_kfw_ins on public.entries for insert with check (
  public.has_role('kabinenfestwart') and id ~ '^[a-z0-9]{9,20}$' and data->>'fineId' = 'kf-manual'
  and coalesce((data->>'kabinenfest')::boolean, false) and public.num_or0(data->>'amount') = 0
  and not coalesce((data->>'paid')::boolean, false) and data->>'createdBy' = auth.uid()::text);
-- eigene, noch nicht erledigte Kabinenfeste ohne Betrag wieder löschen (z. B. „Rückgängig“ nach dem Eintragen)
drop policy if exists entries_kfw_del on public.entries;
create policy entries_kfw_del on public.entries for delete using (
  public.has_role('kabinenfestwart') and data->>'fineId' = 'kf-manual' and data->>'createdBy' = auth.uid()::text
  and public.num_or0(data->>'amount') = 0 and not coalesce((data->>'paid')::boolean, false) and not coalesce((data->>'kfDone')::boolean, false));
create or replace function public.kf_patch(doc_id text, patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.can_book() or public.has_role('kabinenfestwart')) then raise exception 'Keine Berechtigung'; end if;
  if jsonb_typeof(patch) <> 'object' or exists (select 1 from jsonb_object_keys(patch) k where k not in ('kfDone', 'kfOrder', 'kfWeek')) then raise exception 'Nur Kabinenfest-Felder'; end if;
  if patch ? 'kfWeek' and patch->>'kfWeek' is not null and patch->>'kfWeek' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Ungültige Woche'; end if;
  update public.entries set data = data || patch, updated_at = now()
   where id = doc_id and coalesce((data->>'kabinenfest')::boolean, false);
end $$;
revoke execute on function public.kf_patch(text, jsonb) from public, anon;
grant execute on function public.kf_patch(text, jsonb) to authenticated;

-- ---------- Anzeigenhauptmeister (Statistik) ----------
-- Wie viele Anzeigen jemand erstattet hat, pro Monat. Es zählen nur vom Kassenwart bestätigte (offene und abgelehnte nicht). Gibt nur Spieler-ID, Monat und Anzahl heraus, keine Inhalte.
create or replace function public.anzeigen_rangliste() returns table(pid text, mon text, n int)
language sql stable security definer set search_path = public as $$
  select data->>'by', left(data->>'createdAt', 7), count(*)::int from public.anzeigen
   where public.is_member() and data->>'status' = 'ok' and nullif(data->>'by', '') is not null
   group by 1, 2
$$;
revoke execute on function public.anzeigen_rangliste() from public, anon;
grant execute on function public.anzeigen_rangliste() to authenticated;

-- ---------- Würfelliste: wer noch würfeln muss ----------
-- data: name (Spieler oder freier Name), pid (wenn es ein Spieler ist), createdAt. Alle sehen die Liste, eintragen und abhaken dürfen Kassenwart und Admin.
create table if not exists public.wuerfel (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now(),
  constraint wuerfel_form check (length(data::text) < 600 and length(coalesce(data->>'name', '')) between 1 and 80));
alter table public.wuerfel enable row level security;
drop policy if exists wuerfel_read on public.wuerfel;
create policy wuerfel_read on public.wuerfel for select using (public.is_member());
drop policy if exists wuerfel_write on public.wuerfel;
create policy wuerfel_write on public.wuerfel for all using (public.can_book()) with check (public.can_book());
do $$ begin alter publication supabase_realtime add table public.wuerfel; exception when duplicate_object then null; end $$;

-- ---------- Umfrage bei Auswärtsfahrten: „Treffpunkt (Bus)“ oder „direkt“ ----------
-- Die Frage hängt am Spiel (termine.data.poll), die Antworten stehen in „umfrage“ (eine Zeile pro Spieler und Spiel).
-- Starten oder löschen dürfen Trainer, Mannschaftsverantwortlicher und Admin und legen fest, bis wann abgestimmt wird (poll.until);
-- antworten darf jeder nur für sich selbst, bis zu diesem Zeitpunkt (spätestens am Spieltag).
create table if not exists public.umfrage (id text primary key, data jsonb not null default '{}', updated_at timestamptz not null default now(),
  constraint umfrage_form check (length(data::text) < 300 and data->>'choice' in ('treff', 'direkt')));
alter table public.umfrage enable row level security;
create or replace function public.umfrage_offen(doc text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.termine where id = doc and data->>'type' = 'spiel' and data ? 'poll'
                   and data->>'date' >= to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM-DD')
                   and (data->'poll'->>'until' is null or now() < (data->'poll'->>'until')::timestamptz))
$$;
drop policy if exists umfrage_read on public.umfrage;
create policy umfrage_read on public.umfrage for select using (public.is_member());
drop policy if exists umfrage_ins on public.umfrage;
create policy umfrage_ins on public.umfrage for insert with check (
  public.is_member() and data->>'pid' = public.my_pid() and id = (data->>'doc') || '_' || (data->>'pid') and public.umfrage_offen(data->>'doc'));
drop policy if exists umfrage_upd on public.umfrage;
create policy umfrage_upd on public.umfrage for update
  using (data->>'pid' = public.my_pid() and public.umfrage_offen(data->>'doc'))
  with check (public.is_member() and data->>'pid' = public.my_pid() and id = (data->>'doc') || '_' || (data->>'pid') and public.umfrage_offen(data->>'doc'));
drop policy if exists umfrage_del on public.umfrage;
create policy umfrage_del on public.umfrage for delete using (data->>'pid' = public.my_pid() and public.umfrage_offen(data->>'doc'));
do $$ begin alter publication supabase_realtime add table public.umfrage; exception when duplicate_object then null; end $$;
-- Umfrage starten (frage, bis) oder löschen (frage leer). Beim Start bekommen alle eine Nachricht.
drop function if exists public.termin_umfrage(text, text);
create or replace function public.termin_umfrage(doc_id text, frage text, bis timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare t jsonb; f text := left(btrim(coalesce(frage, '')), 200);
begin
  if not (public.can_termine() or public.is_mv()) then raise exception 'Keine Berechtigung'; end if;
  select data into t from public.termine where id = doc_id and data->>'type' = 'spiel';
  if t is null then raise exception 'Spiel nicht gefunden'; end if;
  if f = '' then
    update public.termine set data = data - 'poll', updated_at = now() where id = doc_id;
    delete from public.umfrage where data->>'doc' = doc_id;
    return;
  end if;
  if bis is not null and bis <= now() then raise exception 'Das Ende der Umfrage muss in der Zukunft liegen'; end if;
  update public.termine set data = data || jsonb_build_object('poll', jsonb_build_object('q', f,
      'at', coalesce(t->'poll'->>'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'until', to_char(bis at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))), updated_at = now()
   where id = doc_id;
  if not (t ? 'poll') then
    perform public.push_send('umfrage', null, null, '🚐 Umfrage · ' || coalesce(t->>'title', 'Auswärtsspiel'),
      f || coalesce(' · bis ' || public.berlin_txt(bis::text), ''), 'umfrage-' || doc_id);
  end if;
end $$;
revoke execute on function public.termin_umfrage(text, text, timestamptz), public.umfrage_offen(text) from public, anon;
grant execute on function public.termin_umfrage(text, text, timestamptz), public.umfrage_offen(text) to authenticated;

-- ---------- Strafenwart ----------
-- Trägt Strafen aus dem Katalog für alle ein (ohne Kabinenfest, höchstens 200 €), optional mit Foto (Bucket „strafen“).
-- Eigene, noch unbezahlte Einträge darf er ändern und zurücknehmen (z. B. „Rückgängig“). Alles andere bleibt beim Kassenwart.
create or replace function public.sw_entry(d jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('strafenwart') and d->>'createdBy' = auth.uid()::text and coalesce(d->>'playerId', '') !~ '^team-'
    and exists (select 1 from public.fines f where f.id = d->>'fineId') and d->>'fineId' <> 'kf-manual'
    and not coalesce((d->>'paid')::boolean, false) and not coalesce((d->>'kabinenfest')::boolean, false)
    and not coalesce((d->>'reported')::boolean, false) and d->>'creditUsed' is null
    and coalesce((d->>'amount')::numeric, -1) between 0 and 200
    and (d->>'path' is null or d->>'path' like auth.uid()::text || '/%')
$$;
revoke execute on function public.sw_entry(jsonb) from public, anon;
grant execute on function public.sw_entry(jsonb) to authenticated;
drop policy if exists entries_sw_ins on public.entries;
create policy entries_sw_ins on public.entries for insert with check (id ~ '^[a-z0-9]{9,20}$' and public.sw_entry(data));
drop policy if exists entries_sw_upd on public.entries;
create policy entries_sw_upd on public.entries for update using (public.sw_entry(data)) with check (public.sw_entry(data));
drop policy if exists entries_sw_del on public.entries;
create policy entries_sw_del on public.entries for delete using (public.sw_entry(data));

-- Fotos zu Strafen: privat, max. 5 MB, nur Bilder; Pfad immer <user-id>/<datei>.
-- Sehen dürfen es Kassenwart/Admin, wer es hochgeladen hat und die Person, der die Strafe gehört.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('strafen', 'strafen', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists strafen_foto_read on storage.objects;
create policy strafen_foto_read on storage.objects for select using (bucket_id = 'strafen' and (public.can_book() or (storage.foldername(name))[1] = auth.uid()::text
  or exists (select 1 from public.entries e where e.data->>'path' = name and e.data->>'playerId' = public.my_pid())));
drop policy if exists strafen_foto_ins on storage.objects;
create policy strafen_foto_ins on storage.objects for insert with check (bucket_id = 'strafen' and (public.can_book() or public.has_role('strafenwart')) and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists strafen_foto_del on storage.objects;
create policy strafen_foto_del on storage.objects for delete using (bucket_id = 'strafen' and (public.can_book() or (storage.foldername(name))[1] = auth.uid()::text));
