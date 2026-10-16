# R113 — The account windows join js/account-ui.js (part 3b)

**Date:** 2026-10-16 · **Release:** `2.0.0-alpha.143` · No data-model change. · **Plan:** `docs/superpowers/plans/2026-10-12-app-js-modules.md` (part 3, step 3b).

**Status:** the user's request. After R112 the user said: "Kreni".

## The change

Nothing changes for the user. The code moves:

- **`js/account-ui.js`** takes the account windows from `js/app.js`. They share one form (`data-account-form`) and one way to close:
  - "Promeni lozinku" and "Promeni e-adresu" (R43): `openAccountWindow`, `setAccountWindow`, `accountFields`, `currentSession`, `closeAccountWindow`, `accountSubmit`, `accountPasswordSubmit`, `accountEmailSubmit`;
  - the journal password window (R51: turn encryption on, unlock, turn it off): `openJournalCipherWindow`, `setJournalWindow`, `journalCipherSubmit`.

  Their markup stays in `js/settings-ui.js`, as before.
- **The live state.** As in R112, the text stays except that the live variables go through the context. The window and the return focus are read (`app.state`, `app.modalState`, `app.modalReturnFocus`) and written through their setters; the sync record is only written (`app.setSyncMeta`). Whether a sync is running is read live too (`app.syncRunning`), because the journal window refuses while one runs ("Sync is running. Try again in a moment.").
- **Its entries:**
  - the buttons `account-change-password`, `account-change-email` and `journal-cipher-enable` / `-unlock` / `-disable` go to the module's `handleAction`;
  - `app.js`'s submit listener asks for `account-submit` by name, beside `welcome-submit`.
- **`js/app.js`** keeps everything that the sync and the backups also use, or that stops or asks the sync. These are the last step (3c):
  - the journal key helpers (`journalCipherStored` … `afterJournalSync`);
  - `completeSignIn`;
  - the server check;
  - signing out;
  - deleting the account;
  - the first-sync choice.

  `domainContext()` gains `storeJournalKey`, `forgetJournalKey`, `scheduleSync` and `get syncRunning()`. `app.js` shrinks from 6,830 to 6,661 lines; the module grows to about 450.
- **The plan:**
  - part 3 has three steps, not four;
  - 3b is these windows;
  - 3c is the sync with what stops or asks it.
- **Tests:**
  - In `tests/support/source.js`, `accountWelcome()` is now `accountCode()` (the module's code, now more than the welcome screen), and `withApp` gives `syncRunning` too.
  - Updated, with R113 comments:
    - `redesign-r43`: its harness loads the module's code; the actions and the submit line;
    - `journal-cipher-r51`: the window reads the live state through the context; the actions are the module's;
    - `redesign-r40` and `sync-app-v2-0a`: the renamed helper;
    - `account-welcome-r112`: its pin is now "or later".

## Checks

- **Node:** `tests/account-windows-r113.test.js`, written first; it failed 5/5. It covers:
  - what moved and what stays;
  - the named form;
  - the context line, and every helper the module takes is a key of `domainContext()`;
  - no bare live name;
  - a run in `vm`: the three kinds of window open, the sent form reaches its window, unlocking needs a locked journal, and the sync's action is not the module's;
  - the plan;
  - the version.
- **The move itself:** both ways, with `app.` taken back out:
  - every line that left `app.js` is in the module;
  - every new module line was in the old `app.js` or the old module.

  The exceptions are the updated comments, the helper list and the `account-submit` branch.
- **Suites:** syntax 250/250, Node 1544/1544, `npm run smoke`, `check:python` 4/4, `check:links` and build (52 files).
- **Manual-pending:**
  - with an account signed in: "Promeni lozinku" (with the code or the current password when the server asks) and "Promeni e-adresu";
  - the journal password: on, unlock on a second device, off.

## Review

- **Result:** a read-only review of `20a25cc` found no behavior difference, no missed live name and no misdirected test lookup.
- **Records:** the ledger and this spec said that `redesign-r40`, `sync-app-v2-0a` and `account-welcome-r112` had R113 comments. They did not, so a follow-up test commit adds them where `accountCode()` loads the module.
- **The follow-up test commit (no new version):**
  - `tests/account-windows-r113.test.js` now runs `journalCipherSubmit` in `vm` against a stubbed `Sync`, turning encryption on and then off. It is the one moved function that writes the state and the sync record; before, it was only matched as text. A temporary bare `state` in the module fails this run and the bare-name check.
  - The `attach()` lookups in `phone-feel-r62`, `calendar-r91`, `drag-module-r110`, `redesign-r2`, `redesign-r25` and `redesign-r44` name `js/drag-ui.js`, since `js/quick-add-ui.js` has an `attach()` too.
  - A broken comment in `tests/support/source.js` is mended.
- **Settled afterwards:** the commits' co-author trailer had named the model, while CLAUDE.md's rule against model identifiers names commits too.
  - Asked on 2026-10-16, the user agreed ("moze") to drop the name from the next commit on.
  - Earlier commits keep theirs, and CLAUDE.md now gives the exact trailer.
