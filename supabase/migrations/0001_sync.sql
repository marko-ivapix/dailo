-- Dailo V2.0 sync schema (spec: docs/superpowers/specs/2026-10-08-todo-v2-0-design.md, section C).
-- Run once in the Supabase SQL editor of an EU project. Every row belongs to the signed-in user;
-- Row Level Security keeps users apart, so the public anon key in the app is safe to publish.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews', 'settings', 'habitLogs')),
  id text not null check (char_length(id) between 1 and 200),
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, type, id),
  check ((deleted and data is null) or (not deleted and data is not null))
);

create index if not exists records_user_updated_at on public.records (user_id, updated_at);

-- Versions replaced by another device's write (last write wins) stay recoverable here.
create table if not exists public.record_history (
  history_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  id text not null,
  data jsonb,
  deleted boolean not null,
  updated_at timestamptz not null,
  replaced_at timestamptz not null default clock_timestamp()
);

create index if not exists record_history_user_record on public.record_history (user_id, type, id, replaced_at desc);

-- The server clock orders all changes; clients pull "everything after my cursor".
create or replace function public.touch_record() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.touch_record();

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
  return new;
end;
$$;

drop trigger if exists records_history on public.records;
create trigger records_history after update on public.records
for each row execute function public.keep_record_history();

alter table public.records enable row level security;
alter table public.record_history enable row level security;

drop policy if exists "records are private" on public.records;
create policy "records are private" on public.records
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "history is private" on public.record_history;
create policy "history is private" on public.record_history
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.records from anon;
revoke all on public.record_history from anon;
revoke insert, update, delete on public.record_history from authenticated;

-- App Store rule: users can delete their account and data from inside the app.
create or replace function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  delete from public.record_history where user_id = me;
  delete from public.records where user_id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.keep_record_history() from public, anon, authenticated;
