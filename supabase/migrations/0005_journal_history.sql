-- Dailo R51: when the journal is encrypted on the devices, its earlier readable versions leave the server history.
-- Run once in the SQL Editor after 0001–0004. The app calls it after the first sync with the journal sealed.
create or replace function public.purge_journal_history()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.record_history where user_id = auth.uid() and type = 'journal' returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.purge_journal_history() from public;
grant execute on function public.purge_journal_history() to authenticated;
