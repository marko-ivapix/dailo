-- Dailo R58: fixes from the 2026-10-12 security review (docs/superpowers/specs/2026-10-12-security-review.md).
-- Run once in the SQL Editor after 0001–0005. Every statement can run again safely.

-- 1. Realtime: Supabase sends DELETE events without Row Level Security, so publishing `records` would tell every
--    listening account the keys of other accounts' deleted rows. Devices now listen to one opaque row per account,
--    which changes with every write of that account; its key is a random id, never a user id or a record id.
create table if not exists public.record_pokes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  changed_at timestamptz not null default clock_timestamp()
);

alter table public.record_pokes enable row level security;

drop policy if exists "pokes are private" on public.record_pokes;
create policy "pokes are private" on public.record_pokes
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.record_pokes from anon;
revoke insert, update, delete on public.record_pokes from authenticated;
grant select on public.record_pokes to authenticated;

-- One poke per account per statement, however many rows a push writes.
create or replace function public.poke_record_owner() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.record_pokes (user_id, changed_at)
  select owners.user_id, clock_timestamp() from (select distinct user_id from changed) as owners
  on conflict (user_id) do update set changed_at = excluded.changed_at;
  return null;
end;
$$;

revoke all on function public.poke_record_owner() from public, anon, authenticated;

-- Transition tables allow one event per trigger, so inserts and updates get one trigger each. Hard deletes happen only
-- when an account is deleted, and they poke nothing.
drop trigger if exists records_poke_insert on public.records;
create trigger records_poke_insert after insert on public.records
  referencing new table as changed
  for each statement execute function public.poke_record_owner();

drop trigger if exists records_poke_update on public.records;
create trigger records_poke_update after update on public.records
  referencing new table as changed
  for each statement execute function public.poke_record_owner();

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records') then
    alter publication supabase_realtime drop table public.records;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'record_pokes') then
    alter publication supabase_realtime add table public.record_pokes;
  end if;
end
$$;

-- 2. One record holds at most 256 KB, so an open sign-up cannot fill the database. Rows already there are not checked.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'records_data_size' and conrelid = 'public.records'::regclass) then
    alter table public.records add constraint records_data_size check (data is null or pg_column_size(data) <= 262144) not valid;
  end if;
end
$$;

-- 3. Earlier versions stay recoverable for 90 days; each write of an account clears its older history.
create index if not exists record_history_user_replaced on public.record_history (user_id, replaced_at);

create or replace function public.keep_record_history() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.data is distinct from new.data or old.deleted is distinct from new.deleted then
    insert into public.record_history (user_id, type, id, data, deleted, updated_at)
    values (old.user_id, old.type, old.id, old.data, old.deleted, old.updated_at);
  end if;
  delete from public.record_history where user_id = old.user_id and replaced_at < clock_timestamp() - interval '90 days';
  return new;
end;
$$;

revoke all on function public.keep_record_history() from public, anon, authenticated;

-- 4. The journal purge is for signed-in accounts only.
revoke all on function public.purge_journal_history() from anon;
