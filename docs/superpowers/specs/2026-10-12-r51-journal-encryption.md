# R51 — the encrypted journal (data model)

**Date:** 2026-10-12 · **Status:** the user's request (improvement 3, "moze sve"); a data-model change, so it has its own spec. · **Release:** `2.0.0-alpha.78`.

## Goal

With a signed-in account, the journal can be encrypted end to end. The server and Supabase then see only ciphertext for the text and the mood of each entry. On the devices the journal stays readable, as before; the R26 journal lock still guards the screen.

## The secret and what is shared

- **Journal password:** chosen by the user in Nalog. It is separate from the account password and never leaves the device.
- **The key:** AES-GCM 256, derived with PBKDF2-SHA-256 (600,000 iterations, a random 16-byte salt).
- **`settings.journalCipher`:** the shared, non-secret part, which syncs with the other settings:

  ```json
  { "v": 1, "salt": "<base64, 16 bytes>", "iterations": 600000, "check": { "v": 1, "iv": "<base64, 12 bytes>", "ct": "<base64>" } }
  ```

  `check` is the fixed text `dailo-journal-v1` encrypted with the key; another device tells a wrong password by it.
- **Device-local key:** `dailoJournalKey` in `localStorage` holds `{ salt, key }`, the raw key in base64. It is outside state, sync and backups, like the session in `dailoSync`. It counts only while its salt equals `settings.journalCipher.salt`, and it is removed on sign-out, on account deletion, and when encryption is turned off on another device.

## What goes over the network

The encryption sits only at the network boundary of `syncOnce`:
- `push` seals each journal record on the way out;
- `pull` opens each sealed journal row on the way in.

Everything between works on the readable entry: the shadow hashes, the comparison, last-write-wins and applying. Shadow format 2 stays as it is.

- **A sealed journal record:** `data` is `{ id, date, sealed: { v: 1, iv, ct } }`.
  - `ct` is the whole entry as JSON (`text`, `mood`, `createdAt`, `updatedAt`), with a fresh 12-byte IV for each push.
  - The id and the date stay readable, so the server only learns that a day has an entry.
  - Deletions stay tombstones without data.
- **A device that has the key:**
  - It pushes sealed records.
  - It opens sealed rows, and a row whose content does not open or does not match its id and date is left out.
  - Readable rows (from before encryption, or from an older app) still apply.
- **A device that is locked** (`settings.journalCipher` is set but it has no valid key):
  - It neither pushes nor deletes journal records (`journal` is skipped in the diff, so its shadow keeps them for later).
  - It leaves sealed rows out, and the first-sync "keep the account data" mode does not delete its local entries.
  - Entering the password stores the key and resets the pull cursor, so the next sync fetches the rows it left out.
- **No encryption** (`settings.journalCipher` missing): nothing changes.

## Turning it on, off and unlocking

- **On** (Nalog → Šifrovan dnevnik → Uključi; password twice, at least 8 characters with a digit and a letter):
  1. The device sets `settings.journalCipher` and keeps the key.
  2. It removes the journal keys from its shadow, so the next sync pushes every entry sealed.
  3. It marks `purgeJournalHistory` in the sync meta. After the next successful sync with the key, the app calls `purge_journal_history()` (migration `0005_journal_history.sql`), which deletes the account's journal rows from `record_history`, where the readable versions were kept.
  4. Without the migration the call fails, the mark stays, and Nalog names the migration; the journal itself is still sealed from then on.
- **Unlock on another device:** the password is checked against `check`. A wrong one says so and stores nothing.
- **Off** (Nalog → Isključi šifrovanje, confirmed):
  1. `settings.journalCipher` is removed and the key forgotten.
  2. The journal keys leave the shadow, so the next sync pushes every entry readable again.
  3. Other devices forget their key when the setting disappears.
- **Forgotten password:** the entries on the devices stay readable. On the server they cannot be read, but turning encryption off on a device that has them, then on again with a new password, pushes them again. Nalog says this before turning it on.

## Older app versions

A device on alpha.77 or older does not know `sealed`. It shows a sealed entry as empty and could overwrite it if the user edits that day there. So every device is updated before encryption is turned on, as with R38, and Nalog says so in the "Uključi" window. It keeps `settings.journalCipher` as it is, since settings keep unknown fields.

## Backups

- **ZIP backups:** they contain the readable journal (local data) and `settings.journalCipher`. *Changed in R75 (`2026-10-15-r75-backup-journal-sealed.md`): with the key on the exporting device, the journal in the ZIP is sealed.*
- **Validation:** `Backup.validateDomain` accepts a missing setting or a well-formed one (`v` 1, base64 salt, integer iterations 1,000–10,000,000 (the app uses 600,000; the lower bound only checks the shape), `check` with `iv` and `ct`), and rejects anything else.
- **Import:** a backup restored on another device brings the setting with it, so that device is locked until the password is entered.

## Server

`supabase/migrations/0005_journal_history.sql` adds `public.purge_journal_history()`, a security-definer function for authenticated users that deletes their own `type = 'journal'` rows from `record_history` and returns the count. The Supabase guide lists it as step 7.

## Tests (written first)

`tests/journal-cipher-r51.test.js`, with real WebCrypto in Node and few iterations, covers:
- creating, unlocking, a wrong password, and exporting and importing the key;
- two devices with the key on the fake server: the server row holds no readable text, and the other device reads the entry;
- a locked device: it pushes nothing, deletes nothing, takes nothing, and after unlocking with the cursor reset it takes the entry;
- turning encryption on over readable rows: they are pushed sealed and the history is purged;
- a row that does not open is left out;
- readable rows still apply;
- the app wiring, Nalog, the Dnevnik notice, backups, the migration and the version.
