# R107 — Reset with or without a copy

**Date:** 2026-10-16 · **Release:** `2.0.0-alpha.136` · No data-model change.

**Status:** the user's decision.
- The user asked: "da li bi bilo dobro da stavimo da je opciono cuvanje podataka (backup) kada klijent hoce da obrise svoje podatke?"
- After the proposal, the user said: "da, uradi tako, neka bude uključena".
- This amends the AGENTS.md rule for global destructive actions (step 1, the safety ZIP) for Reset only.

## Why

- **The ZIP was always made.** "Resetuj podatke aplikacije" made and downloaded a ZIP with all the data, and the reset stopped if it was not saved. Someone who wants their data gone does not want such a file left behind.
- **Old data stayed on the device anyway.**
  - Up to five automatic local snapshots stayed in IndexedDB.
  - On the phone, up to four weekly automatic ZIPs stayed in Documents/Dailo.
- **The account kept its data.** With an account signed in, the reset left the account's data, and the next sync brought it back.

## The change

- **The choice:** Podešavanja → Podaci has a row "Sačuvaj kopiju pre brisanja" under "Resetuj podatke aplikacije".
  - It is a checkbox, **on by default**.
  - It is on again after every reset and after each app start (`resetKeepCopy`, kept in memory only, not a stored key).
  - The reset row now reads "Briše zadatke, projekte, oznake, priloge i podešavanja na ovom uređaju."
- **On:** everything works as before: safety ZIP → recovery copy → `RESETUJ` → replace → verify → roll back on failure.
- **Off:**
  - No ZIP is made or downloaded.
  - The recovery copy is still made. It guards the reset and is removed right after, as before.
  - The window says: "Kopija se ne čuva: posle ovoga podaci ne mogu da se vrate. Brišu se i lokalni snimci i automatske kopije na telefonu." `RESETUJ` is still required.
  - After the verified reset (`eraseDeviceCopies`):
    - every recovery snapshot left in IndexedDB is deleted (the automatic ones and kept one-item copies);
    - on the phone, the automatic backup files `dailo-auto-*.zip` in Documents/Dailo are deleted (`DailoPlatform.files.deleteBackupCopies`). Other files in the folder stay;
    - the automatic-backup record forgets its last file.
  - A failure here is reported like a failed recovery cleanup, and the new empty data is already verified.
- **Signed in (with or without a copy):** the window adds "Na ovom uređaju je prijavljen nalog: ovo briše samo podatke na uređaju, a podaci sa naloga se vraćaju pri sledećoj sinhronizaciji. Da obrišeš sve, prvo obriši nalog (Još → Nalog → Obriši nalog), pa resetuj."
- **Restore** always makes its ZIP (`keepCopy` applies to `reset` only).
- **Rules:** AGENTS.md (step 1, and the typed words RESETUJ / VRATI) and CLAUDE.md ("Rules that are easy to break") say this.
- **Pages:** the guide (Rezervne kopije) and Šta je novo, with a new day: 16 October, alpha.136.
- **Legal pages:** the privacy policy already says device data stays until it is deleted in Podešavanja → Podaci, so it needs no change.

## Checks

- **Node:** `tests/reset-copy-r107.test.js`, written first; 5 of its 6 tests failed. The one that passed checks the reset with a copy, which keeps working as before.
- **What it covers:**
  - the real reset flow in a harness (memory IndexedDB, Backup) with and without a copy;
  - the account note;
  - a restore that keeps its ZIP;
  - the phone's file deletion against a fake Filesystem;
  - the Settings row, the strings, AGENTS.md and the pages.
- **Older tests updated (with comments):**
  - `redesign-r10g`: the Podaci rows;
  - `whats-new-r81`: the new day on top;
  - R106's version pin is now "or later".
- **Manual-pending:**
  - the phone: a reset without a copy removes the files in Documents/Dailo;
  - a reset while signed in.
