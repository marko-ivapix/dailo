# Redesign R12a — the journal collection (data model)

**Date:** 2026-10-10 · **Status:** the data-model spec the plan requires before any UI uses the journal (`docs/superpowers/plans/2026-10-10-redesign-implementation.md`, R12 "journal collection (own spec)"); it implements the data side of J1–J9 in `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Release:** `2.0.0-alpha.31`.

R12 ships in parts:

- **R12a:** this collection and setting in Core, backups and sync, with no UI.
- **R12b:** the Dnevnik screen and the entry window (J1–J3, J5, J7, J9).
- **R12c:** the evening notice on Today and the reminder setting (J4, J6).

The weekly review row (J8) comes with the review screen in R13.

## The collection

`state.journal` is an array of entries, one per calendar day:

| Field | Values |
| --- | --- |
| `id` | `journal_<date>` (`Core.journalEntryId(date)`). The id is the day, so two devices writing the same day meet in one record and sync's last-write-wins decides, instead of making two entries. |
| `date` | a valid `YYYY-MM-DD`, unique in the collection |
| `text` | a string, empty by default |
| `mood` | `null` or an integer 1–5 (Loše, Slabo, Onako, Dobro, Odlično) |
| `createdAt`, `updatedAt` | ISO timestamps, like the other records |

- **Core:**
  - `Core.normalizeState` adds `journal: []` to older data.
  - It fills a missing `text` with `''` and an invalid `mood` with `null`.
  - `validateStateV3` refuses data whose journal is not an array, or has an entry without an id or valid date, or two entries for one day (`invalid-journal`). It sends such data to recovery as with the other collections; nothing is dropped silently.
  - `Core.journalEntryFor(state, date)` finds a day's entry.
  - The journal joins the duplicate-id check.
- **Setting:** `settings.journalReminderTime` is a local `HH:MM` time or `null` (off). When missing it is `20:00` (J6), through `Core.journalReminderTime(settings)`. It syncs with the other shared settings.

## Validation, backups and sync

- **Backups:**
  - `Backup.validateDomain` accepts the journal and the setting and rejects bad values: a bad or duplicate date, an id that is not `journal_<date>`, a non-string text, a mood outside 1–5, a bad time or bad timestamps.
  - Backups made before R12a, without a journal, validate unchanged.
  - The ZIP format (`backupVersion: 2`), schema V3 and IndexedDB v1 are unchanged. The journal is part of the app data like the notes, so export and import carry it, within the existing size limits.
- **Sync:**
  - `journal` joins the synced collections (`js/sync.js`).
  - The server needs the new migration `supabase/migrations/0002_journal.sql`, which adds `journal` to the `records.type` check. The Serbian setup guide (`docs/v2/podesavanje-supabase.md`) lists it after `0001_sync.sql`.
  - Sync is not set up yet (no project URL or key), so no existing server is affected.
- **Undo:** the delete-safety fingerprint (`undoDomain`) includes the journal.
- **Not included:**
  - local-snapshot selective restore (entries have no title to list);
  - global Search (J5).

## Older versions

A device on an earlier alpha keeps an unknown `journal` array as it is in local data. Its sync ignores the unknown type and never deletes it (M2), and its backup validation does not check it. All beta devices update through the service worker.

## Tests (written first)

`tests/redesign-r12a.test.js`:

- normalization of old and new data;
- recovery for a bad journal;
- the id, lookup and reminder-time helpers;
- backup acceptance and rejection;
- old backups;
- sync carrying a journal entry between two devices;
- the migration text and the setup guide step;
- the version `2.0.0-alpha.31`.
