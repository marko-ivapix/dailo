# R75 — The encrypted journal stays encrypted in ZIP backups (data model)

**Date:** 2026-10-15 · **Status:** point 2 of the outside review, which the user accepted ("Sve se slažem, ali ostavi pod broj 1…"). The review said the ZIP probably holds the journal unencrypted; the source confirmed it (R51 put the readable journal into backups). A backup-format change, so it has its own data-model spec. · **Release:** `2.0.0-alpha.102`.

## Goal

With the encrypted journal on, a ZIP backup no longer carries the journal readable. This covers Izvezi ZIP, the safety ZIP before a reset or restore, and the phone app's weekly automatic copy in Documents/Dailo, which the Files app can see.

## What changes in the ZIP

- **Format:** the ZIP stays `backupVersion: 2`. Schema V3 and IndexedDB v1 do not change.
- **Sealed entries:** when `settings.journalCipher` is set and the exporting device has the key, every entry of `data.journal` is sealed the way sync sends it:

  ```json
  { "id": "journal_2026-10-14", "date": "2026-10-14", "sealed": { "v": 1, "iv": "<base64, 12 bytes>", "ct": "<base64>" } }
  ```

  - `ct` is the whole entry as JSON, AES-GCM with a fresh IV (`Sync.sealJournalRecord`).
  - The id and the date stay readable.
  - The readable entries are validated before sealing; the key never enters the ZIP.
  - `settings.journalCipher` (salt, iterations, check) goes along, as before.
- **When it stays readable:**
  - without encryption;
  - on a locked device (encryption on, but no key here): those entries are already readable on this device, and there is nothing to seal them with.
- **Reading a ZIP (`inspectBackupV3`):** sealed entries leave `data.journal` before validation and come back as `sealedJournal`. `summary.sealedJournal` counts them; the summary is unchanged without them. The ZIP is refused (`Invalid backup: journal`) when:
  - there are sealed entries but no `settings.journalCipher`;
  - an entry is not exactly `{ id, date, sealed }`, its id does not match its date, or `sealed` is not `{ v: 1, iv (12 bytes), ct }`;
  - a day appears twice, sealed or readable.
- **Older app versions** (alpha.101 and older) refuse such a ZIP with `Invalid backup: journal`. They never drop the journal silently.

## The restore

`Backup.openJournalEntries(sealed, open)` opens every entry, or returns `null` if one does not open. The app opens with `Sync.openJournalData(key, …)`, and the opened entries pass `Backup.validateDomain` before they join the state to restore.

- **This device has the key** for the backup's cipher (the same salt in `dailoJournalKey`): the entries open while the restore is prepared. The window says "Šifrovan dnevnik (unosa: N) otvara se ključem sa ovog uređaja." If they do not open, the preparation stops and nothing is replaced.
- **Otherwise** the restore window asks for **Lozinka dnevnika** next to `VRATI`, and says that without it everything else is restored.
  - **A wrong password:** "Lozinka dnevnika nije tačna." The window stays open and nothing is replaced.
  - **The right password:** the entries open before the recovery snapshot is marked `mutating`. After the verified commit, the key is stored for the restored cipher (`dailoJournalKey`), so the device is "on" and does not ask again.
  - **No password:** everything else is restored and the journal is left out. The toast says "Rezervna kopija je vraćena bez šifrovanog dnevnika." The restored `settings.journalCipher` makes the device locked until the password is entered in Nalog; with sync, the journal then comes from the server.
- The safety ZIP and the recovery snapshot work as before. The safety ZIP is sealed on a device with the key.

## Not changed

- Local recovery snapshots (IndexedDB) keep the readable state, as the device itself does.
- Restoring one item from a snapshot is unchanged.
- "Izvezi dnevnik" (R26) is a text export the user asks for, so it stays readable.

## Checks

- **Node:** `tests/backup-journal-r75.test.js`, written first; it failed 7 of 9. The two that passed guard the unchanged readable export and the refusal by older validation. It covers:
  - sealing with real WebCrypto, with no readable text left in `data.json`;
  - the readable export without a key;
  - setting sealed entries apart, opening them with the key and failing with another key;
  - the refusals;
  - the app wiring for all three ZIP writers;
  - the restore with the device key or the password;
  - the Serbian strings;
  - the version.
- **Older tests updated (with comments):**
  - `tests/redesign-r27.test.js`: the harness loads `journalBackupOptions`;
  - `tests/guide-r74.test.js`: the version is now "or later".
- **Chromium (390 px), on the real app:**
  - Device A, with encryption and the key: Izvezi ZIP gives `data.json` with only `{ date, id, sealed }` entries and no readable text. Re-importing there says the device key opens it and shows no password field.
  - Fresh device B: the window names the encrypted journal. A wrong password is refused and the window stays open. The right password restores the entry, which shows on the Dnevnik screen, and stores the key with the cipher's salt.
  - Fresh device C, with no password: the toast says it was restored without the journal. It has 0 entries, the tasks are restored, the cipher is kept and there is no key.
- **Manual-pending:**
  - the automatic copy on a real phone;
  - a restore on a phone (iPhone and Android file pickers).
