-- Dailo attachment sync (V2.1, spec: docs/superpowers/specs/2026-10-12-redesign-r46-attachment-sync.md).
-- Run once after 0001_sync.sql and 0002_journal.sql in the Supabase SQL editor.
-- 1. The records table accepts "attachments" rows: a file's metadata (owner, name, type, size), never its contents.
-- 2. A private bucket "attachments" holds the files at "<user id>/<attachment id>", at most 10 MB each like the app.
-- 3. Each signed-in user reads and writes only the folder named after their own id.
-- delete_my_account() cannot remove Storage objects from SQL; the app deletes the account's files before calling it.

alter table public.records drop constraint if exists records_type_check;
alter table public.records add constraint records_type_check check (type in ('tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews', 'settings', 'habitLogs', 'journal', 'attachments'));

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "attachments: read own files" on storage.objects;
create policy "attachments: read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "attachments: add own files" on storage.objects;
create policy "attachments: add own files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "attachments: replace own files" on storage.objects;
create policy "attachments: replace own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "attachments: delete own files" on storage.objects;
create policy "attachments: delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
