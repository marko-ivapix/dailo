# R113 — The account windows join js/account-ui.js (part 3b)

**Date:** 2026-10-16 · **Release:** `2.0.0-alpha.143` · No data-model change. · **Plan:** `docs/superpowers/plans/2026-10-12-app-js-modules.md` (part 3, step 3b).

**Status:** the user's request. After R112 the user said: "Kreni".

## The change

Nothing changes for the user. The code moves:

- **`js/account-ui.js`** takes the account windows from `js/app.js`. They share one form (`data-account-form`) and one way to close:
  - "Promeni lozinku" and "Promeni e-adresu" (R43): `openAccountWindow`, `setAccountWindow`, `accountFields`, `currentSession`, `closeAccountWindow`, `accountSubmit`, `accountPasswordSubmit`, `accountEmailSubmit`;
  - the journal password window (R51: turn encryption on, unlock, turn it off): `openJournalCipherWindow`, `setJournalWindow`, `journalCipherSubmit`.

  Their markup stays in `js/settings-ui.js`, as before.
- **The live state.** As in R112, the text stays except that the live variables are read through the context (`app.state`, `app.modalState`, `app.syncMeta`, `app.modalReturnFocus`) and written through its setters. Whether a sync is running is also read live (`app.syncRunning`), because the journal window waits for it.
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
