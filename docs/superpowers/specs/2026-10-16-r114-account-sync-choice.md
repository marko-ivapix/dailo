# R114 — Signing out, deleting the account and the first-sync choice join js/account-ui.js (part 3c)

**Date:** 2026-10-16 · **Release:** `2.0.0-alpha.144` · No data-model change. · **Plan:** `docs/superpowers/plans/2026-10-12-app-js-modules.md` (part 3, step 3c).

**Status:** the user's request. After R113 the user said: "kreni sa 3c". The step was narrowed while it was measured (below). Told of this in the report, the user agreed: "slažem se, ostavi sinhronizaciju u app.js".

## The change

Nothing changes for the user. The code moves:

- **`js/account-ui.js`** takes what the account does around the sync from `js/app.js`:
  - finishing a sign-in on the device's sync record (`completeSignIn`), which the welcome screen and the e-mail change in the same module call;
  - "Odjavi se" (R64: `signOutSync`, `signOutToWelcome`);
  - deleting the account (`deleteSyncAccount`);
  - the first-sync choice (`openSyncChoice`, `renderSyncChoice`, `chooseSyncMode`).
- **The live state.** As in R112 and R113, the text stays except that the live variables go through the context:
  - the window and the data are read as `app.modalState` and `app.state` and the window is set through `app.setModalState`;
  - the sync record is set through `app.setSyncMeta`;
  - the sync's timer is read live (`app.syncTimer`).
- **Its entries:**
  - `renderModal` asks the module for the choice window first (`renderRoute` with `{ type: 'modal', modalType: 'sync-choice' }`); the module's register block gains `renderRoute`;
  - the buttons `sync-sign-out`, `sync-delete-account` and `sync-choose` go to the module's `handleAction`;
  - `runSync` asks for the window by name (`accountAction('sync-choice-open')`) when the first sync finds data on both sides.
  - `signOutToWelcome` opens the sign-in screen inside the module (`openWelcome('sign-in', { firstRun: true })`). `app.js` no longer asks for `welcome-open`, so that named entry is gone.
- **`domainContext()`** gains `liveSync`, `SYNC_META_KEY`, `plainWord` and `get syncTimer()`, and no longer gives `completeSignIn`. The module also reads `window.TodoStorage` for the recovery copy the choice makes first. `app.js` shrinks from 6,661 to 6,588 lines; the module grows to about 535.

## Why the sync itself stays in `app.js`

The plan had 3c take the sync itself as well. Measuring it showed why it should stay, so this step moves only the account's side, and the user agreed ("slažem se, ostavi sinhronizaciju u app.js"):

- `applySyncResult` replaces the app's state and the archived tasks (R103). Moving it would hand a module the state itself, through a `setState` and a `setArchivedTasks`, which no module has.
- `scheduleSync` runs on every save, so every save would go through a module call.
- The sync's pure part is already a file of its own (`js/sync.js`). What is left in `app.js` (`scheduleSync`, `runSync`, `applySyncResult`, the attachment list, the sync card and status, realtime and `startSync`, the server check, the journal key helpers and the archive) is the glue between it and the state.

The plan records 3c as done in R114 and says why the sync stays.

## Checks

- **Node:** `tests/account-sync-choice-r114.test.js`, written first; it failed 5/5. It covers:
  - what moved and what stays;
  - `renderModal` without the choice window, and `runSync`'s named call;
  - the register block, the context line, every helper the module takes being a key of `domainContext()`, and `completeSignIn` no longer in the context;
  - no bare live name, the timer included;
  - a run in `vm`: the choice opens and draws its three options, cancelling it signs out (the socket closes, the key is forgotten, the record is emptied, the server is told last), and a choice makes the recovery copy first and then runs the sync; the sync's own action is not the module's;
  - the plan;
  - the version.
- **Older tests, updated with R114 comments:**
  - `tests/support/source.js`: `withApp` reads `syncTimer` live too;
  - `sign-out-r64`: its harness runs the module's code (`accountCode()`) and sees the sign-in screen open from inside it; the button and the choice's cancel are read in the module;
  - `account-welcome-r112`: `completeSignIn` is the module's, `signOutToWelcome` opens the screen itself, `welcome-open` is no longer an entry, the register block has `renderRoute`, and the bare-name check leaves the translated strings out (the choice's text says "recovery copy");
  - `account-windows-r113`: the moved names leave its "stays" list, its plan check allows 3c done, and its pin is now "or later";
  - `realtime-r50`, `journal-cipher-r51`, `sync-app-v2-0a` and `transfer-m9`: they read signing out, deleting the account, the choice window and `runSync`'s named call where they now are.
- **The move itself:** both ways, with `app.` and the setters taken back out:
  - every line that left `app.js` is in the module;
  - every new module line was in the old `app.js` or the old module.

  The exceptions are the updated comments, the helper list, the `TodoStorage` line, `renderRoute`, the `sync-choice-open` branch, the three button branches and the `openWelcome` call.
- **Mutations:** a bare `syncMeta = {}` in `signOutSync` fails the new test; a snapshot of anything but `app.state` fails `sync-app-v2-0a`.
- **Suites:** syntax 251/251, Node 1550/1550, `npm run smoke`, `check:python` 4/4, `check:links` and build (52 files).
- **Manual-pending:**
  - "Odjavi se" on Nalog: Danas behind the sign-in screen;
  - "Obriši nalog" with OBRIŠI;
  - the first-sync choice on a device with its own data: each of the three options, and "Otkaži i odjavi se".

## Review

- **Result:** a read-only review of `b2c1bef` found no behavior difference. It found no missed live name and no module that answers these actions or this window first. The helpers taken once are constants or a function declaration. `TodoStorage` loads before the module.
- **Records:** `CLAUDE.md` and `CONTINUATION.md` made the narrowing read as settled. They then said that the user had not answered yet; the user's answer came afterwards ("slažem se, ostavi sinhronizaciju u app.js") and is recorded there. A missing comma in `PROJECT_MAP.md` is fixed.
- **Noted for the next step:** the commit title lacked the version (`… (2.0.0-alpha.144)`), as the `release-step` skill asks. History is not rewritten.
