-- Dragons Strafenkasse – Supabase-Schema
-- Jede Sammlung ist eine Tabelle (id text, data jsonb). Zugriff regeln Row-Level-Security-Policies.
--   member      : angemeldet + vom Admin freigeschaltet → darf alles lesen, eigene Zahlung melden
--   kassenwart  : wie member + Strafen/Rechnungen eintragen + Zahltag starten (nur er)
--   admin       : wie member + Strafen/Rechnungen eintragen + Katalog, Kader, Zahlungsdaten, Mitglieder verwalten

-- ---------- Mitglieder ----------
create table if not exists public.members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  player_id  text,
  role       text not null default 'member' check (role in ('member','kassenwart','admin')),
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);

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
create policy members_admin_update on public.members for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists members_admin_delete on public.members;
create policy members_admin_delete on public.members for delete using (public.is_admin() or (user_id = auth.uid() and approved = false));

-- ---------- Dokument-Tabellen ----------
do $$
declare t text;
begin
  foreach t in array array['players','fines','entries','bills','settings','zahltag'] loop
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
  foreach t in array array['players','fines','entries','bills','settings','zahltag'] loop
    cond := case t
      when 'players'  then 'public.is_admin()'
      when 'fines'    then 'public.is_admin()'
      when 'settings' then 'public.is_admin()'
      when 'zahltag'  then 'public.is_kw()'        -- nur der Kassenwart
      else                 'public.can_book()'      -- entries, bills: Kassenwart + Admin
    end;
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format('create policy %I on public.%I for insert with check (%s)', t||'_ins', t, cond);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)', t||'_upd', t, cond, cond);
    execute format('create policy %I on public.%I for delete using (%s)', t||'_del', t, cond);
  end loop;
end $$;

-- Teil-Update eines Dokuments (RLS gilt, weil security invoker)
create or replace function public.doc_patch(t text, doc_id text, patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if t not in ('players','fines','entries','bills','settings','zahltag') then raise exception 'unknown table'; end if;
  execute format('update public.%I set data = data || $1, updated_at = now() where id = $2', t) using patch, doc_id;
end $$;

-- „Ich habe bezahlt“: markiert NUR die eigenen offenen Einträge
create or replace function public.mark_self_paid() returns int
language plpgsql security definer set search_path = public as $$
declare pid text; n int;
begin
  select player_id into pid from public.members where user_id = auth.uid() and approved;
  if pid is null then raise exception 'Kein verknüpfter Spieler'; end if;
  update public.entries
     set data = data || jsonb_build_object('paid', true, 'paidAt', now(), 'paidVia', 'gemeldet', 'reportedBy', auth.uid()),
         updated_at = now()
   where data->>'playerId' = pid and coalesce((data->>'paid')::boolean, false) = false;
  get diagnostics n = row_count;
  return n;
end $$;

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

grant execute on function public.doc_patch(text, text, jsonb), public.mark_self_paid(), public.apply_late_fees() to authenticated;
revoke execute on function public.mark_self_paid(), public.apply_late_fees(), public.doc_patch(text, text, jsonb) from anon;

-- Live-Updates
do $$
declare t text;
begin
  foreach t in array array['players','fines','entries','bills','settings','zahltag','members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
