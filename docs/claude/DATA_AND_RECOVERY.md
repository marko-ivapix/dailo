# Data, persistence and recovery

This is the current storage contract inspected on 2026-10-07 (V1.9; rechecked 2026-10-08 for V1.9.1, which changes no storage) from `js/core.js`, `js/storage.js`, `js/attachments.js`, `js/backup.js`, `js/release.js` and the coordinating portions of `js/app.js` and `js/settings-ui.js`. V1.9 changes no schema: metadata `version: 3`, IndexedDB `todoAppDB` v1 and ZIP `backupVersion: 2` are unchanged, and no key or ID was renamed.

## Two persistence layers

### `localStorage`

- Key: `todoAppData`.
- Metadata schema: `version: 3`.
- Contains normalized arrays for `tasks`, `projects`, `tags`, `areas`, `goals`, `habits`, `notes`, `resources`, `templates` and `savedViews`, plus `settings` and `ui` preferences.
- Transient runtime caches such as `habitLogCache` and `habitMetrics` are not persisted.
- `saveState()` normalizes before writing and preserves IDs; it does not silently repair invalid future data.
- Device-local key `todoAppBackupReminderSnoozedUntil` (V1.9): an ISO time 24 h after "Remind me tomorrow". It is not part of `todoAppData`, snapshots or ZIP backups, so a restore or another device never carries it. Reads and writes are wrapped in `try`; in private mode the notice simply returns.

### IndexedDB

- Database: `todoAppDB`, database version `1`.
- Stores: `attachments`, `habitLogs`, `goalHistory`, `recoverySnapshots`.
- Attachments are Blob records with owner metadata and attachment IDs referenced by Tasks, Notes or Resources.
- Habit logs and Goal history are separate from the compact metadata object.
- The legacy V1.2 `todoAppAttachments` database is copied non-destructively into the shared attachment store during migration.
- Memory storage doubles are available to Node tests; they are not the production persistence path.

Do not confuse these versions:

| Contract | Current value | Meaning |
| --- | --- | --- |
| Metadata schema | `3` | `localStorage` state shape |
| IndexedDB database | `1` | Object-store schema |
| ZIP backup format | `2` | `backup.js` export/import manifest contract |
| Application label in exported ZIP | `1.3` | Historical app version field |
| Release version in exported ZIP | `1.9.1` | `releaseVersion` from `DailoRelease.APP_VERSION` (V1.9; `null` if release metadata is unavailable) |

`exportBackupV3` refers to the V3 state payload, not to ZIP format 3. The current implementation exports `backupVersion: 2` and accepts backup versions `1` and `2`. The manifest's historical `appVersion: '1.3'` is not the current product release label; since V1.9 the release label is the separate `releaseVersion` field. Older ZIPs without `releaseVersion` remain importable.

## Startup and V1.2 → V3 migration

1. `app.js` opens Storage and reads the saved metadata.
2. Missing metadata creates normalized sample state.
3. Existing V1/V2/V3 metadata passes through `Core.migrateStateV3`, `Core.migrateStateV16` and normalization.
4. Storage prepares a migration snapshot when records/files may need migration.
5. Validation runs before the normalized state is committed.
6. Source checks compare the current `localStorage` bytes before and after asynchronous work. A changing source retries rather than overwriting another tab.
7. Legacy attachment Blobs are copied into the shared store without deleting the original until the migration is safe.
8. Invalid or unsupported data enters a recovery surface; it is not replaced with an empty app.

V1.6/V1.7 preferences are additive: Today filter, Today focus strip, compact density, week-start preference and personalization defaults are normalized without dropping existing records. V1.7 also bounds snapshot/import work and surfaces stale-tab refresh instead of silently overwriting newer canonical data.

V1.9 settings and readings:

- `settings.backupReminderDays` is an optional integer 0–90 (0 = off). `Core.backupReminderDays()` reads a missing or invalid value as 7. `normalizeV16Settings` gives it no default, because `tests/core-v1-6.test.js` compares the whole normalized object. Settings → Data writes only integers 0–90; backup import rejects other values (`Invalid backup: backupReminderDays`), and a ZIP round trip keeps the value.
- `settings.weekStartsOn` keeps its stored values (`1` default, `0`, `'monday'`, `'sunday'`). `Core.weekStartKey()` interprets `0`/`'sunday'` as Sunday and everything else as Monday, so there is no data migration.
- `backupStatus.validationResult` still stores English sentences. They are translated at display time with `trMessage` ("Prefix: detail" failures translate the prefix); there is no migration. Last export/import are shown as local dates in a `<time datetime="…">` element that keeps the raw ISO value.

## Automatic local snapshots

After successful saves, the app attempts an automatic snapshot after an idle delay, rate-limited to at most one capture every five minutes. Startup also schedules capture. Five automatic snapshots are retained. Interrupted global operations use separate recovery snapshots and are not pruned as ordinary automatic history.

Snapshots can include normalized metadata, attachment records/Blobs, Habit logs and Goal history. They consume the same browser storage quota and are not a replacement for an exported ZIP.

## Device storage protection (V1.9)

- **Eviction risk.** WebKit can delete script-writable storage (localStorage, IndexedDB) for sites not opened for 7 days. Apps installed to the Home Screen are exempt, so installing is the main protection; persistence and the backup reminder are backstops.
- **Persistent storage.** The app reads `navigator.storage.persisted()` at startup without asking. It calls `navigator.storage.persist()` once per session on the first user click, or from Settings → Data → Persistent storage → Request while the status is "not granted". Settings shows granted / not granted / not supported and usage from `navigator.storage.estimate()`.
- **Safari vs installed app.** A Safari tab and the installed Home Screen app keep separate storage: data created in Safari does not appear in the installed app. The Settings install row says to install first and then use Dailo. Existing Safari data moves by ZIP export in Safari and import in the installed app.
- **Backup reminder.** `Core.backupReminderDue()` counts from `backupStatus.lastExport`, or from the oldest valid `createdAt` among Tasks, Goals, Habits, Notes and Resources when there was never an export. Nothing is due with no data, with the reminder off, or while snoozed. The existing status model can only cause an extra reminder, never a missed one: a restore adopts the backup's older status, a reset clears it, safety ZIPs do not count and a status write is skipped on a concurrent change.
- **Service worker cache.** `dailo-shell-<APP_VERSION>` holds only the app shell files. It never stores user data, and activating a new version deletes only older `dailo-shell-*` caches.

## Full ZIP backup and restore

Settings → Data can export a ZIP containing:

```text
todo-backup-YYYY-MM-DD.zip
├── data.json
└── attachments/<owner-directory>/<safe-file-name>
```

The manifest contains state and attachment metadata, the historical `appVersion: '1.3'` and, since V1.9, `releaseVersion`. `Backup.inspectBackupV3()` validates JSON shape, IDs, references, dates, recurrence, Goal/Habit fields, attachment ownership and every referenced file before replacement.

Replace All is never a merge:

1. Export/download a safety ZIP of the current data.
2. Capture an internal recovery snapshot.
3. Validate the incoming ZIP fully.
4. Require typed `RESTORE`.
5. Replace metadata and IndexedDB records through guarded transactions.
6. Verify the resulting bytes and domain data.
7. Remove the temporary recovery copy only after the verified commit.

If replacement or verification fails, the original snapshot is restored. If cleanup fails after a verified operation, the recovery copy remains available and the UI offers Retry instead of claiming cleanup succeeded.

## Selective restore

Settings → Data → Local snapshots can replace one selected Task, Project, Area, Tag, Goal, Habit, Note, Resource, Template or Saved View from a saved snapshot. The operation preserves unrelated current records and owned files/history where possible. Reciprocal Goal links are reconciled for supported Task/Project/Habit/Goal restores. Missing linked dependencies reject the restore before writes.

Selective restore downloads a safety ZIP, creates a recovery copy, requires typed `RESTORE`, verifies writes and exposes a short Undo window. Later edits make Undo refuse to overwrite newer data; the recovery copy remains available for an explicit recovery attempt.

## Delete and Undo

Normal entity deletion follows Confirmation → Delete → Snackbar Undo. Owned attachments, Habit logs, Goal links/history or related records are retained/restored according to the entity's lifecycle. Expired Undo work is cleaned from IndexedDB only after its protection window.

Reset and Replace All are stronger operations: safety ZIP, internal snapshot, typed confirmation, guarded mutation, verification and rollback. `Clear Completed` has confirmation and Undo behavior.

## Recovery status safety

Backup status writes are guarded by the source object, compact state text and raw `localStorage` value captured by the current operation. Startup reconciliation waits until a valid state is loaded. Cleanup Retry captures a fresh source token so an ordinary edit before Retry does not leave false status or overwrite newer data; a concurrent tab write during deletion is rejected.

These guards are local-tab/source checks, not a multi-user conflict-resolution system.
