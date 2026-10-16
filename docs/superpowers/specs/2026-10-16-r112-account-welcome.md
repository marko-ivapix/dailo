# R112 — The welcome screen and sign-in move into js/account-ui.js (part 3a)

**Date:** 2026-10-16 · **Release:** `2.0.0-alpha.142` · No data-model change. · **Plan:** `docs/superpowers/plans/2026-10-12-app-js-modules.md` (part 3, "account", step 3a).

**Status:** the user's request. After R111b the user said: "kreni sa trećim delom".
- Part 3 is about 790 lines, and it shares the device's sync record and the start-up flags with `app.js`.
- It moves in four steps, one release each:
  - 3a: the welcome screen;
  - 3b: the account windows, signing out and the first-sync choice;
  - 3c: the journal-cipher windows;
  - 3d: the sync itself.

## The change

Nothing changes for the user. The code moves:

- **`js/account-ui.js`** is a new domain module named `account` (about 275 lines). It takes the welcome screen and sign-in of R40 and R60 from `js/app.js`:
  - the constants: `WELCOME_KEY`, `WELCOME_MODES`, `AUTH_REDIRECT_APP`, `AUTH_LANDING_MESSAGES`, `welcomeCode`;
  - when it opens: `welcomeDue`, `rememberWelcome`, `openWelcome`, `consumeAuthLanding`, `startWelcome`;
  - closing it: `closeWelcome`, `skipWelcome`, `dismissWelcome`;
  - its steps and fields: `setWelcome`, `welcomeFields`, `welcomeMode`, `toggleWelcomePassword`, `welcomeProblem`, `welcomeErrorText`;
  - e-mail and password with codes: `welcomeSubmit`, `welcomeResend`, `finishWelcome`;
  - Google and Apple: `startProviderSignIn`, `finishProviderSignIn`, `consumeAuthRedirect`.

  Its markup stays in `js/settings-ui.js` (`renderWelcome`), as before.
- **The live state.** The functions keep their text, except that they read the app's live variables through the domain context and write them through its setters:
  - read: `app.state`, `app.modalState`, `app.syncMeta`, `app.modalReturnFocus`, and the start-up flags `app.recovery`, `app.storageError`, `app.staleDataNotice`, `app.globalOperation`;
  - written: `app.setModalState`, `app.setSyncMeta`, `app.setModalReturnFocus`.

  The sync record stays one variable in `app.js`, so `runSync`'s check that it is still the same record works as before. The helpers are kept from the first context (`use(ctx)`).
- **Its entry, `handleAction`:**
  - the screen's buttons and Nalog's "Prijavi se" / "Napravi nalog": `open-welcome`, `welcome-mode`, `welcome-skip`, `welcome-provider`, `welcome-resend`, `welcome-toggle-password`;
  - five named calls from `app.js` through `accountAction`, which asks this module alone, as `quickAddAction` does:

    | Call | From |
    | --- | --- |
    | `welcome-start` | `init` |
    | `welcome-open` | `signOutToWelcome` |
    | `welcome-submit` | the form's submit listener |
    | `welcome-provider-return` | `handleIncomingLink`, for `dailo://auth` |
    | `welcome-dismiss` | `handleIncomingLink`, for a shortcut or shared text |
- **`js/app.js`** keeps:
  - `completeSignIn`, with the sync record it writes, because the e-mail change (R43) uses it too;
  - the submit listener, the hashchange rule that keeps the screen, and Back through `modalState.onCancel`.
  - `domainContext()` gains:
    - `syncClient`, `loadSyncMeta`, `saveSyncMeta`, `restoreModalReturnFocus`, `completeSignIn` and `runSync`;
    - getters and setters for `syncMeta` and `modalReturnFocus`;
    - read-only getters for the four start-up flags.
  - It shrinks from 7,057 to 6,830 lines.
- **Loading:** `index.html` loads the module after `js/quick-add-ui.js` and before `js/app.js`, and `sw.js` precaches it.
- **The plan** splits part 3 into steps 3a–3d.
- **Tests:**
  - `tests/support/source.js`:
    - lists the module in `APP_FILES`;
    - `withApp` also gives the sync record, the return focus and the start-up flags;
    - new `accountWelcome()` and `withAccount()`. The harnesses that run `app.js`'s sync block load the moved code into the same sandbox, and `accountAction` reaches the module's `handleAction` there.
  - Updated, each with an R112 comment:
    - `redesign-r40` and `sync-app-v2-0a` (the harness and the wiring lines);
    - `redesign-r43` (the submit line);
    - `security-r58` (`dailo://auth`);
    - `sign-out-r64` (the welcome screen asked by name, the same calls);
    - `final-integration-v1-5` (the start stub);
    - `search-r102` and `quick-add-module-r111` (the load order);
    - `quick-add-paste-r111b` (its pin is now "or later").
- **Pages:** Šta je novo names `2.0.0-alpha.142` in the 16 October range; there is no new line.

## Checks

- **Node:** `tests/account-welcome-r112.test.js`, written first; it failed 6/6. It covers:
  - the moved functions and constants, and that `completeSignIn` stays;
  - the named calls;
  - the context line;
  - the registration, and every helper it takes is a key of `domainContext()`;
  - no bare live name, a spread included;
  - no direct assignment;
  - a run in `vm` of its buttons, the named calls and someone else's action;
  - the load order, `APP_FILES`, the plan and the version.
- **The move itself:** both ways, with `app.` taken back out:
  - every line that left `app.js` is in the module, apart from the six glue lines;
  - every line of the moved part is in the old `app.js`.
- **Suites:** syntax 249/249, Node 1539/1539, `npm run smoke` (it starts on the welcome screen: an invalid address refused, registration and back, "Nastavi bez naloga" remembered), `check:python` 4/4, `check:links` and build (52 files).
- **Manual-pending:**
  - the welcome screen on a phone and in a browser (sign-in, sign-up with the code, a new password, "Nastavi bez naloga");
  - "Odjavi se";
  - Google or Apple once they are turned on;
  - an e-mail link's message.
