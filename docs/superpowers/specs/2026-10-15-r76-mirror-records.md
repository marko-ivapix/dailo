# R76 — The phone's file copy also keeps habits and goal history

**Date:** 2026-10-15 · **Status:** point 3 of the outside review, accepted by the user ("Sve se slažem, ali ostavi pod broj 1…"). The source showed that M5 mirrored only the metadata text, while habit logs and goal history stayed only in IndexedDB. · **Release:** `2.0.0-alpha.103`.

There is no data-model change. State, IndexedDB v1 and the ZIP format stay the same. The new files are device-local, outside state, backups and sync, like `dailo/state.json`.

## The change

- **`js/platform.js` (app only):**
  - The M5 write and read become `writeSafely` and `readSafely`: write to a temporary file, then replace; one write queue; reading falls back to the temporary file.
  - `durable.writeRecords(kind, text)` and `durable.readRecords(kind)` handle `habitLogs` → `Library/dailo/habit-logs.json` and `goalHistory` → `Library/dailo/goal-history.json`.
  - Only a JSON array of objects is written. Any other kind (for example attachments) is refused. The web has no mirror.
- **`js/storage.js`:** `habitLogs.fillEmpty(records)` and `goalHistory.fillEmpty(records)` put records back in one transaction, only into an empty store.
  - Every record is checked first (`id`, `habitId`, `date` / `id`, `goalId`), and the transaction aborts on a duplicate day, so it is all or nothing.
  - A store that already has records is left alone.
- **`js/app.js`:**
  - **Writing:** `writeDurableMirror` (after saves, debounced; on pause at once) also runs `queueRecordsMirror`. It lists each kind and writes its file only when the list changed since the last write. The runs are queued, so an older list never lands last.
  - **Restoring:** `restoreDurableMirror` puts the records back (`restoreRecordsMirror`) only when it has just restored the metadata text. A device that still has its data keeps its stores as they are, so the records always match the restored text. The normal start-up load and the habit metrics then run as before.
- **Not mirrored:** attachments, which can be large. They stay in IndexedDB, in ZIP backups and, with an account, in sync.

## Checks

- **Node:** `tests/mirror-records-r76.test.js`, written first; it failed 6/6. It covers:
  - the files and their temporary-file writes;
  - the refusals, the temporary-file fallback and the web;
  - `fillEmpty` (empty store, a store with records, an invalid record);
  - the app writing only changed kinds;
  - restoring only together with the metadata;
  - the version.
- **Older tests:** `tests/durable-m5.test.js` passes unchanged. `tests/backup-journal-r75.test.js` pins its version as "or later" now.
- **Chromium (real IndexedDB):**
  - `fillEmpty` with an invalid record writes nothing;
  - with two logs for the same habit and day it writes nothing (the transaction aborts);
  - into an empty store it writes all three;
  - a store with records stays as it is.
- **Manual-pending:** on a phone, clear the WebView data (or reinstall without removing the app's Library folder, where possible) and check that habits and goal history come back with the tasks.
