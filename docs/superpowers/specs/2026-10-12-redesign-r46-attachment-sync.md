# Redesign R46 — attachment sync (V2.1, data model)

**Date:** 2026-10-12 · **Status:** point 3 of the next-steps list ("moze 1 i 3"). It carries out decision 4 of the V2.0 spec ("attachments follow in V2.1"). · **Release:** `2.0.0-alpha.72`.

## What syncs

- **The file:** it goes to Supabase Storage, in the private bucket `attachments`, at `<user id>/<attachment id>`, at most 10 MB as in the app.
- **Its metadata:** it is a record of the new sync type `attachments` in the `records` table:

  ```
  { id, ownerType: 'task' | 'note' | 'resource', ownerId, fileName, mimeType, size, createdAt, updatedAt }
  ```

  It never holds the file's contents.
  - **A local file with `taskId`:** it reads as `ownerType: 'task'`.
  - **A pulled record:** it is used only when its id is safe for a Storage path (`[\w-]{1,120}`), its owner type is known and its size is at most 10 MB (`Sync.safeAttachmentData`).
- **The owners' `attachmentIds`:** they stay device-local, as in V2.0. A device adds an id to its owner when it has the file.
  - **The records:** tasks, notes and resources hash and push exactly as before.
  - **The shadow:** it keeps format 2.
- **Unchanged:** IndexedDB v1, the attachment store, ZIP `backupVersion: 2` and schema V3. Nothing is migrated on the device.

## The order of a sync (`Sync.syncOnce` with `files`)

1. **Whether files take part:** they do when the app hands over `files` (`read(id)`, `store(data, blob)`) and the bucket exists. The client asks for a one-item list of the user's folder; "Bucket not found" means the migration is missing.
   - **With the bucket:** the device's attachments (not those in the Undo window) and the files still waiting join the records.
   - **Without the bucket:** attachment records are left out entirely: none are pushed, none are taken from a pull, none are deleted. `meta.fileError` names `0003_attachments.sql`, and Nalog shows it under the last sync.
2. **Before a record is pushed:** its file is uploaded (`x-upsert`), so no device sees a record without its file.
   - **An upload that fails:** for example 413 "Fajl je veći nego što server dozvoljava". The record is not pushed and not put in the shadow, so it is tried again next time. The others go on.
3. **A deleted attachment:** its record goes out as deleted, and its file is removed from Storage. A leftover file costs space, not data.
4. **A pulled record for a file this device lacks:** it waits in `meta.pendingFiles` (device-local, in `dailoSync`).
   - **Counted as present:** a waiting file counts as present, so no deletion is ever pushed for it.
   - **After the pull:** each waiting file is downloaded and handed to `files.store`, which puts it in IndexedDB under its owner and adds its id to the owner's `attachmentIds`.
   - **An owner that has not arrived yet:** the file keeps waiting; so does a failed download.
5. **A pulled deletion:**
   - **Its id:** it is removed from the owners' `attachmentIds` in the state that is written.
   - **The local file:** `result.fileDeletes` reaches the app's `applySyncResult`, which deletes it from IndexedDB after the save.
   - **A deferred write:** the existing deferral (a dialog, Undo, typing) applies, so nothing is lost.
6. **First-sync choices:**
   - **"Zadrži podatke sa naloga":** it replaces local files with the account's.
   - **"Zadrži podatke sa ovog uređaja":** it uploads this device's files and deletes the account's others.
   - **"Spoji":** it uploads and downloads both.
7. **Deleting the account:** it lists and removes the user's files first. SQL may not delete Storage objects, so `delete_my_account()` leaves them.

## Server (`supabase/migrations/0003_attachments.sql`)

- **The record type:** `records_type_check` gains `attachments`.
- **The bucket:** `attachments` is private, with `file_size_limit` 10 MB.
- **Four policies on `storage.objects`:**
  - **Actions:** select, insert, update (for the upsert) and delete, for `authenticated` users.
  - **Where:** only in the bucket's folder named after `auth.uid()`.

## Older apps

- **What they do:** devices on `2.0.0-alpha.71` or older ignore `attachments` rows (an unknown type is never deleted, M2). They keep their files local and never push deletions for others' files.
- **What to do:** update every device to see files everywhere.

## The app

- **Wiring:** `runSync` gives the sync `attachments: await syncAttachmentList()` and `files: syncFiles`.
- **`syncFiles.store`:**
  - **When it waits:** it returns `false` (the file waits) while a dialog, Undo or a global operation is open, or when the owner is missing.
  - **A full owner:** an owner already holding 10 files on this device leaves the new file only in the account.
- **Texts:**
  - **Settings privacy line:** "Tvoji podaci, zajedno sa prilozima, …".
  - **Nalog:** "Zadaci, projekti, ciljevi, navike, beleške, prilozi i podešavanja se sinhronizuju…".
  - **`privatnost.html`:** it says that attachments sync to a private Storage folder, at most 10 MB each.

## Checks

- **Node:** `tests/redesign-r46.test.js`, written first; it failed 9 of 10. It covers:
  - the metadata record;
  - two devices uploading, downloading and deleting;
  - a failed download that waits and pushes no deletion;
  - a server without the migration;
  - a refused large file;
  - account deletion and unsafe ids;
  - the migration;
  - the app's `syncFiles`;
  - the texts.
- **Fake server:** `tests/support/fake-supabase.js` models Storage, with per-user folders, the size limit, download failures and a missing bucket.
- **Manual-pending:** running `0003_attachments.sql`, and a real file going from a phone to another device and being deleted.
