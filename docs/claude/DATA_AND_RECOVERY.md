# Data, persistence and recovery

This is the current storage contract inspected from `js/core.js`, `js/storage.js`, `js/attachments.js`, `js/backup.js` and the coordinating portions of `js/app.js`.

## Two persistence layers

### `localStorage`

- Key: `todoAppData`.
- Metadata schema: `version: 3`.
- Contains normalized arrays for `tasks`, `projects`, `tags`, `areas`, `goals`, `habits`, `notes`, `resources`, `templates` and `savedViews`, plus `settings` and `ui` preferences.
- Transient runtime caches such as `habitLogCache` and `habitMetrics` are not persisted.
- `saveState()` normalizes before writing and preserves IDs; it does not silently repair invalid future data.

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

`exportBackupV3` refers to the V3 state payload, not to ZIP format 3. The current implementation exports `backupVersion: 2` and accepts backup versions `1` and `2`; an older README sentence claiming ZIP format 3 is stale.

## Startup and V1.2 → V3 migration

1. `app.js` opens Storage and reads the saved metadata.
2. Missing metadata creates normalized sample state.
3. Existing V1/V2/V3 metadata passes through `Core.migrateStateV3`, `Core.migrateStateV16` and normalization.
4. Storage prepares a migration snapshot when records/files may need migration.
5. Validation runs before the normalized state is committed.
6. Source checks compare the current `localStorage` bytes before and after asynchronous work. A changing source retries rather than overwriting another tab.
7. Legacy attachment Blobs are copied into the shared store without deleting the original until the migration is safe.
8. Invalid or unsupported data enters a recovery surface; it is not replaced with an empty app.

V1.6 preferences are additive: Today filter, Today focus strip, compact density, week-start preference and personalization defaults are normalized without dropping existing records.

## Automatic local snapshots

After successful saves, the app attempts an automatic snapshot after an idle delay, rate-limited to at most one capture every five minutes. Startup also schedules capture. Five automatic snapshots are retained. Interrupted global operations use separate recovery snapshots and are not pruned as ordinary automatic history.

Snapshots can include normalized metadata, attachment records/Blobs, Habit logs and Goal history. They consume the same browser storage quota and are not a replacement for an exported ZIP.

## Full ZIP backup and restore

Settings → Data can export a ZIP containing:

```text
todo-backup-YYYY-MM-DD.zip
├── data.json
└── attachments/<owner-directory>/<safe-file-name>
```

The manifest contains state and attachment metadata. `Backup.inspectBackupV3()` validates JSON shape, IDs, references, dates, recurrence, Goal/Habit fields, attachment ownership and every referenced file before replacement.

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
