-- Dailo R50: Realtime tells each signed-in device that a record of its account changed, so it syncs at once
-- instead of on the next five-minute round. Run once in the SQL Editor after 0001–0003.
-- Row Level Security still applies to Realtime: a device only hears about its own account's rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end
$$;
