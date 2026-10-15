# R78 — Restoring the encrypted journal: fixes from the R75 review

**Date:** 2026-10-15 · **Status:** the read-only review of R75 (`18b6caf`) found nothing blocking. These are its low-severity findings, fixed so that R75 is complete; the user accepted the review work ("Sve se slažem…"). · **Release:** `2.0.0-alpha.105`. No data-model change.

## The change

- **Otkaži while the journal password is checked.**
  - **The problem:** the check (PBKDF2, 600,000 iterations) can take seconds on a phone. Otkaži pressed meanwhile was dropped without a word, and the restore went ahead.
  - **The fix:** `unlockRestoredJournal` marks `op.unlocking` and shows "Proveravam lozinku dnevnika…". `abandonGlobalOperation` remembers a cancel that comes while it runs (`op.cancelRequested`). Once the check ends, `commitGlobalOperation` cancels the restore, so nothing is replaced and the usual "Operacija je otkazana. Postojeći podaci su zadržani." appears.
- **Storing the key.**
  - **The problem:** `storeJournalKey` ran inside the commit's `try`, before the screen was redrawn.
  - **The fix:** it now runs after the redraw, and only while the restored state has `settings.journalCipher`. A failure there can never roll a verified restore back.
- **Recorded, not changed:**
  - **The app is ended right after the replacement, before the key is stored:** the restored journal is readable on the device, but the device is locked for sync until the journal password is entered in Nalog. No data is lost.
  - **The device's own key does not open the entries:** this happens only with a damaged or altered file. The whole restore is refused, as the R75 spec says.

## Checks

- **Node:** `tests/restore-journal-r78.test.js`, written first; it failed 4/5. It runs the real restore flow (Backup, Storage and Sync with WebCrypto) in a harness, which closes the review's coverage gap. It covers:
  - a wrong password, which keeps the window and the data;
  - the right password, which restores the journal and stores the key after the redraw;
  - no password, which restores everything else and stores no key;
  - Otkaži during the check, which replaces nothing;
  - the guarded key storing and the Serbian string;
  - the version.
- **Older tests updated (with comments):**
  - `tests/backup-journal-r75.test.js`: the guarded key line;
  - `tests/ics-uid-r77.test.js`: the version is now "or later".
- **Chromium (390 px):** a ZIP made with the real 600,000 iterations. Otkaži pressed right after "Vrati" closed the window and showed "Operacija je otkazana…", and the backup's tasks were not restored.
- **Manual-pending:** the same on a phone.
