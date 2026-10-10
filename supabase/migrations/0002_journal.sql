-- Dailo journal sync (spec: docs/superpowers/specs/2026-10-10-redesign-r12a-journal-data.md).
-- Run once after 0001_sync.sql in the Supabase SQL editor. It only widens the allowed record types with
-- 'journal' (one record per day, id "journal_<date>"); existing rows and policies are unchanged.

alter table public.records drop constraint if exists records_type_check;
alter table public.records add constraint records_type_check check (type in ('tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews', 'settings', 'habitLogs', 'journal'));
