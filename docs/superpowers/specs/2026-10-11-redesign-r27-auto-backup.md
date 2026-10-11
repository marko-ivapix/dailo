# Redesign R27 — an automatic weekly backup on the phone (design)

**Date:** 2026-10-11 · **Status:** addition J of the second design pass, which the user approved with "moze sve". It adds one device-local setting, specified below · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.52` (phone app).

## Why

Sync stays off until the Supabase project exists, and the WebView's storage can be cleared or evicted. The durable copy (M5, `Library/dailo/state.json`) holds the metadata only: no habit logs, goal history or attachments. A full ZIP outside the app's own data closes that gap without the user remembering to export.

## Behavior

1. **The setting.**
   - **Where:** Podešavanja → Podaci → "Automatska rezervna kopija" (a switch), in the phone app only.
   - **Its line:** "Jednom nedeljno u Documents/Dailo na ovom telefonu; čuvaju se četiri najnovije." It also shows the last copy's time, or why the last attempt failed.
2. **Turning it on:** it makes a copy at once and says where ("Rezervna kopija je sačuvana u Documents/Dailo"). On Android 10 and older the system's storage question comes here, in context, and not at a later start.
3. **When it runs:**
   - **The check:** 8 seconds after the app starts and on every resume. It runs when the last copy is 7 days old or there is none yet.
   - **Never during:** an import, a restore, recovery or startup.
   - **Only one at a time.**
4. **What it writes:**
   - **The ZIP:** the same full ZIP as "Izvezi" (`Backup.exportBackupV3`: metadata, attachments, habit logs, goal history).
   - **The file:** `Documents/Dailo/dailo-auto-<date>.zip` (`DailoPlatform.files.saveBackupCopy`, chunked like the share sheet).
   - **Pruning:** the newest four `dailo-auto-*.zip` files stay and older ones are deleted. Any other file in the folder is left alone.
5. **The folder.**
   - **Android:** the public Documents folder, which the Files app and other apps can reach and which keeps the copies when Dailo's own data is cleared.
     - **Android 11+:** needs no permission for the app's own files.
     - **Android 10:** uses legacy storage (`requestLegacyExternalStorage`).
     - **Older versions:** ask for `WRITE_EXTERNAL_STORAGE`, limited to API 29 (and `READ_EXTERNAL_STORAGE` to API 32).
   - **iOS:** the app's Documents folder, shown in Files under "Na mom iPhone-u → Dailo" (`UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace`).
6. **Restoring:** "Vrati iz rezervne kopije" with such a file, the existing validated flow.
7. **What does not change:** the backup reminder on Danas and "Poslednji izvoz" still count only exports made by the user. A copy on the same phone does not replace one kept elsewhere.

## Data model

- **No change to `state`, backups or sync.**
- **One new device-local `localStorage` key, `dailoAutoBackup`:** `{ "enabled": boolean, "lastAt": ISO | null, "lastFile": string | null, "error": string | null }`. It is not exported, imported or synced, so each phone decides for itself.

## Tests (written first)

`tests/redesign-r27.test.js`:

- `saveBackupCopy` writes to `DOCUMENTS/Dailo`, keeps four and leaves other files; the web refuses;
- `autoBackupDue`: off, never, six or seven days, the web, an unreadable date;
- `runAutoBackup` writes, remembers, records an error and does nothing during an import;
- the Settings switch, its handler, the start and resume checks, the Serbian text;
- the Android permissions and legacy flag;
- the iOS Files keys;
- the version `2.0.0-alpha.52`.

## Manual checks

On a phone:

- turn it on;
- find the ZIP in Files → Documents/Dailo;
- restore it in a fresh install;
- after a week (or a changed date) a new copy, and the fifth one prunes the oldest.
