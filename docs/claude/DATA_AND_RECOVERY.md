# Data, persistence and recovery

This is the current storage contract inspected on 2026-10-07 (V1.9) and rechecked on 2026-10-08 for V1.9.1 and V1.10 (no storage change) for V1.11 and V1.12 (two optional settings, `d00855b`) and for V2.0-a (one device-local sync key, `7a834db`), from `js/core.js`, `js/storage.js`, `js/attachments.js`, `js/backup.js`, `js/release.js`, `js/sync.js` and the coordinating portions of `js/app.js` and `js/settings-ui.js`. V1.9–V2.0-a change no schema: metadata `version: 3`, IndexedDB `todoAppDB` v1 and ZIP `backupVersion: 2` are unchanged, and no key or ID was renamed.

## Two persistence layers

### `localStorage`

- Key: `todoAppData`.
- Metadata schema: `version: 3`.
- Contains normalized arrays for `tasks`, `projects`, `tags`, `areas`, `goals`, `habits`, `notes`, `resources`, `templates` and `savedViews`, plus `settings` and `ui` preferences.
- Transient runtime caches such as `habitLogCache` and `habitMetrics` are not persisted.
- `saveState()` normalizes before writing and preserves IDs; it does not silently repair invalid future data.
- Device-local key `todoAppBackupReminderSnoozedUntil` (V1.9): an ISO time 24 h after "Remind me tomorrow". It is not part of `todoAppData`, snapshots or ZIP backups, so a restore or another device never carries it. Reads and writes are wrapped in `try`; in private mode the notice simply returns.

- Device-local key `dailoSync` (V2.0-a): `{ userId, session, shadow, cursor, lastSyncAt, lastError }` for the optional sync. `session` holds the Supabase access and refresh tokens and the account e-mail; `shadow` maps `type/id` to the hash last synced; `cursor` is the newest server `updated_at` seen. It is not part of `todoAppData`, snapshots or ZIP backups. Sign-out and account deletion remove it; an expired session removes only `session`.

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
| Release version in exported ZIP | `1.12.0` | `releaseVersion` from `DailoRelease.APP_VERSION` (since V1.9; `null` if release metadata is unavailable) |

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

V1.11 and V1.12 settings (both optional, no normalization default, so `normalizeV16Settings` and "Reset personalization" keep whatever is stored; a ZIP round trip keeps them):

- `settings.weeklyReviews` (V1.11): an array of `{ weekStart: 'YYYY-MM-DD', completedAt: ISO }`. `Core.weeklyReviewLog()` reads only valid entries, newest first, one per week, at most 26; `Core.recordWeeklyReview()` writes such a sanitized list when the user finishes a review. A missing field means "never reviewed". Backup export and import reject a present value that is not an array of at most 52 entries, each an object with a valid date `weekStart` and an ISO `completedAt` (`Invalid backup: weeklyReviews`).
- `settings.dailyCapacityMinutes` (V1.12): an integer 0–1440 (0 = off). `Core.dailyCapacityMinutes()` reads a missing or invalid value as 360 (6 h). Settings → General "Dnevni kapacitet" writes only integers 0–1440, immediately on change; backup export and import reject other values (`Invalid backup: dailyCapacityMinutes`).
- `ui.calendarView` (V1.12) may now be `day` besides `week` and `month`; any other value normalizes to `week`. UI preferences are not validated by backup import.
- The day view's 30-minute estimate for a timed task without a duration is computed at render time; nothing is written to the Task.

## Automatic local snapshots

After successful saves, the app attempts an automatic snapshot after an idle delay, rate-limited to at most one capture every five minutes. Startup also schedules capture. Five automatic snapshots are retained. Interrupted global operations use separate recovery snapshots and are not pruned as ordinary automatic history.

Snapshots can include normalized metadata, attachment records/Blobs, Habit logs and Goal history. They consume the same browser storage quota and are not a replacement for an exported ZIP.

## Sync and the server copy (V2.0-a)

- **Off by default.** Sync is optional and off until `js/sync-config.js` has the project URL and public key. Without it nothing leaves the device.
- **What reaches the server:** the records of the ten collections, the settings without `backupStatus` and `compactDensity`, and the habit logs. Attachments (and `attachmentIds`), goal history, `ui` and recovery snapshots stay on the device (V2.1 adds attachments and goal history).
- **Deletes** become tombstones (`deleted = true`, `data = null`), so other devices remove the record.
- **Server history.** Every update replaces a row and copies the previous version into `record_history`. It can be read only by its owner and is recovered on the server, not through the app.
- **Local safety.** Pulled data goes through the same `saveState` path, so automatic snapshots keep running. The first-sync choice takes a forced automatic snapshot first (`{ force: true }`), and the ZIP backup, Undo and selective restore stay available.
- **Reset or ZIP restore while signed in:** a committed full reset or restore clears the shadow and cursor (`forgetSyncShadow`, the session stays), so the next sync is a first sync. After a reset (empty device) the account data comes back; after a restore, with data on both sides, the choice dialog opens. Nothing is deleted on the server by a reset; removing the server data takes "Obriši nalog". A selective restore of one item syncs like a normal edit.
- **Account deletion** (`delete_my_account()`) removes the server rows, history and auth user; local data stays.

## Native app storage and moving data (modernization, 2.0.0-alpha.2)

- **Same layers.** In the Capacitor app `localStorage` and IndexedDB live in the app's WebView container (origin `capacitor://localhost` on iOS, `https://localhost` on Android), separate from Safari and Chrome. Nothing is migrated automatically between the browser and the app.
- **Durable mirror.** The app also writes the canonical `todoAppData` text to `Library/dailo/state.json` (Filesystem `LIBRARY` directory; a temporary file first, then delete-and-rename; writes queued; non-object JSON refused). It is written 1 s after a save, after a start-up load and after a reset/restore commit, and at once on pause. At start, only when `localStorage` has no canonical key, the mirror (or its temporary copy) is put back and the normal load validates and migrates it. Existing data is never replaced by the mirror. Habit logs, goal history and attachments are not mirrored; they are in IndexedDB and, for logs, in sync.
- **Device-local keys** (outside state, sync and ZIP backups): `dailoSync` (V2.0-a), `dailoNotified` (moments the phone was asked to show), `dailoNotifyAsked` (the system question was asked once), `dailoSample` (fingerprint of the first-run examples) and `dailoTransferDismissed`.
- **Moving data from the web version.** ZIP: export in the browser, import in the app (validated restore with confirmation and Undo; carries attachments and goal history within the import limits). Sync: sign in on both; while the app still holds only its untouched first-run examples, the first sync takes the account's data (`server` mode) after the usual forced recovery copy instead of asking.
- **Sync data fixes (M2).** A client never deletes record types it does not know (newer apps can add types safely); pulled deletions prune dangling links (`Core.pruneDanglingReferences`) before normalization, so a project deleted on another device no longer stops sync.
- **Habit history fields (M11, `2.0.0-alpha.3`).** Optional `habit.targetHistory` (`[{ before, timesPerWeek }]`, ≤ 104) and `settings.weekStartHistory` (`[{ before, weekStartsOn, changedOn }]`, ≤ 52) keep past habit weeks as they were; backups reject malformed values (`Invalid backup: targetHistory` / `weekStartHistory`); sync carries them in the habit and shared settings records. Data without them behaves as before.
- **Device-local reminder state (M12, `2.0.0-alpha.4`).** `tasks.reminderFiredAt`, `goals.reminderFiredMoments` and `habits.reminderFiredMoments` are device-local sync fields: never pushed, kept on pull, still in this device's ZIP backups. Firing a reminder no longer bumps `updatedAt`. The sync shadow has `shadowFormat: 2`; an older shadow is upgraded in place (unchanged records rehashed) so the change pushes nothing. Records that first arrive through sync get their past reminder moments marked as handled (`Core.settleArrivedReminders`).
- **Backup limits (M12).** Export and import share `Backup.LIMITS` (2,000 entries, 1,000 attachments, 250 MB of attachments, 300 MB decompressed); the export stops before writing a backup the import would refuse.
- **Colors (M12).** Project, tag and area colors are normalized to `#rgb`/`#rrggbb` on every load, import and sync apply (`Core.safeColor`).
- **Android backup.** `android:allowBackup="true"` stays, so Android's own backup can carry the WebView data and the mirror; not verified on a device.

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
