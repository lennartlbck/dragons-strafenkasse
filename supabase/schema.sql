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
create or replace function public.is_admin()  returns boolean language sql stable security definer set search_path = public as $$ select public.my_role() = 'admin' $$;
create or replace function public.is_kw()     returns boolean language sql stable security definer set search_path = public as $$ select public.my_role() = 'kassenwart' $$;
create or replace function public.can_book()  returns boolean language sql stable security definer set search_path = public as $$ select public.my_role() in ('admin','kassenwart') $$;

alter table public.members enable row level security;
drop policy if exists members_read on public.members;
create policy members_read on public.members for select using (user_id = auth.uid() or public.is_member());
drop policy if exists members_signup on public.members;
create policy members_signup on public.members for insert
  with check (user_id = auth.uid() and role = 'member' and approved = false);
drop policy if exists members_admin_update on public.members;
create policy members_admin_update on public.members for update using (public.can_book()) with check (public.can_book());
drop policy if exists members_admin_delete on public.members;
create policy members_admin_delete on public.members for delete using (public.can_book() or (user_id = auth.uid() and approved = false));

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
create or replace function public.is_decke() returns boolean language sql stable security definer set search_path = public as $$ select public.my_role() = 'deckenzaehler' $$;
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
revoke execute on function public.report_self_paid(), public.undo_self_report(), public.apply_late_fees(), public.doc_patch(text, text, jsonb) from anon;

-- Automatischer Monatsbeitrag: am 1. jedes Monats für jede Person (idempotent).
-- Spieler zahlen den Standardbetrag (fees/default), Personen mit eigenem Eintrag in `fees` den abweichenden Betrag,
-- alle anderen (Trainer, Physio …) nichts. fee_log verhindert, dass ein gelöschter Beitrag wieder auftaucht.
create table if not exists public.fee_log (id text primary key, created_at timestamptz not null default now());
alter table public.fee_log enable row level security;

create or replace function public.ensure_monthly_fees() returns int
language plpgsql security definer set search_path = public as $$
declare
  cur date := date_trunc('month', now() at time zone 'Europe/Berlin')::date;
  def numeric := 10; cfg jsonb; startm date; m date; p record; amt numeric; n int := 0; r int; lid text;
  mn text[] := array['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
begin
  select data into cfg from public.fees where id = 'default';
  if cfg is not null then
    def := coalesce((cfg->>'amount')::numeric, 10);
    if coalesce(cfg->>'startMonth','') ~ '^\d{4}-\d{2}$' then startm := to_date(cfg->>'startMonth' || '-01', 'YYYY-MM-DD'); end if;
  end if;
  m := coalesce(startm, cur);
  while m <= cur loop
    for p in select id, data from public.players where coalesce(data->>'active','true') <> 'false' loop
      select (f.data->>'amount')::numeric into amt from public.fees f where f.id = p.id;
      if amt is null then
        amt := case when p.data->>'role' = 'Spieler' then def else 0 end;
      end if;
      continue when amt <= 0;
      lid := to_char(m, 'YYYY-MM') || '-' || p.id;
      insert into public.fee_log (id) values (lid) on conflict do nothing;
      get diagnostics r = row_count;
      if r = 1 then
        insert into public.entries (id, data) values ('beitrag-' || lid, jsonb_build_object(
          'playerId', p.id, 'fineId', 'f01', 'col', 'beitrag',
          'title', 'Monatsbeitrag ' || mn[extract(month from m)::int] || ' ' || extract(year from m)::int,
          'amount', amt, 'kabinenfest', false, 'kfDone', false, 'note', 'automatisch',
          'date', to_char(m, 'YYYY-MM-DD'), 'createdAt', now(), 'paid', false, 'autoFee', true))
        on conflict (id) do nothing;
        n := n + 1;
      end if;
    end loop;
    m := (m + interval '1 month')::date;
  end loop;
  return n;
end $$;
grant execute on function public.ensure_monthly_fees() to authenticated;
revoke execute on function public.ensure_monthly_fees() from anon;

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
