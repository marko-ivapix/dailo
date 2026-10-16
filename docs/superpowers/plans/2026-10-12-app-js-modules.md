# Splitting js/app.js into modules

**Date:** 2026-10-12 · **Status:** the user's request (improvement 8, "moze sve"); the first step shipped as R56 (`2.0.0-alpha.83`). On 2026-10-16 the user said "da, kreni sa prvim delom", and part 1 (drag) shipped as R110 (`2.0.0-alpha.139`); after "kreni sa drugim delom", part 2 (quick-add) shipped as R111 (`2.0.0-alpha.140`); after "kreni sa trećim delom", part 3 (account) is split into steps, and 3a (the welcome screen) shipped as R112 (`2.0.0-alpha.142`); after "Kreni", 3b (the account windows) shipped as R113 (`2.0.0-alpha.143`). · **Spec:** `docs/superpowers/specs/2026-10-12-r56-app-modules.md`.

## Why

`js/app.js` holds about 6,900 lines: state, rendering, every window and every event. The screens already left it as domain modules (`js/today-ui.js`, `js/calendar-ui.js`, `js/habits-ui.js` and the others). What is left is shared machinery, and a change to one part still means reading a very long file. The goal is smaller files with one job each, without a bundler and without changing what the app does.

## How a part moves

Every part moves the same way the screens did:

1. **A domain module.** The part becomes `js/<name>-ui.js`, an IIFE that registers through `window.TodoDomainModules?.register({ name, renderRoute, handleAction, handleInput, attach })`; every entry but `name` is optional. `renderRoute` answers its own route types (for example `{ type: 'sidebar' }` or a window, `{ type: 'modal', modalType }`), `handleAction` answers its own `data-action` and `data-pop-action` values and returns `true`, `handleInput` answers the typing, changes and keys of its own fields, and `attach(ctx)` (R110) wires listeners of its own once. The drag module also answers `isDragging`.
2. **What it needs comes through `domainContext`.** The module gets the app's state and helpers from `ctx` (one line per group in `domainContext()`). Nothing in the module reaches into `app.js` variables directly, and nothing new goes onto `window`. A moved part may keep the helpers it takes in its own variables (they never change), but it reads the live data and window through the context each time (`ctx.state`, `ctx.modalState`, `ctx.setModalState`), since a sync or a reload replaces them.
3. **`app.js` keeps only the glue.** It asks for markup through `callDomainHook('renderRoute', …)` and passes actions on through `callDomainHook('handleAction', …)`. Keyboard shortcuts stay in `handleKeydown`, and event wiring stays in `attachEvents`, or in a module's optional `attach(ctx)`. A call from `app.js` into a moved part asks that module's adapter by name with a named action (as `quickAddAction` does), for example `'quick-open'`; not through `callDomainHook`, since the other modules' `handleAction` expects a click (R111b).
4. **Load order.** The script tag goes after the other modules and before `js/app.js` in `index.html`, and the file joins the precache list in `sw.js` (so `npm run build` copies it into `www/` for Capacitor).
5. **Tests keep working.** `tests/support/source.js` finds a function wherever it lives: `functionSource(name)` searches every `js/*.js` file, and `appSource()` reads `app.js` together with the modules split out of it (`APP_FILES`, in load order). A test that sliced a moved function out of `app.js` switches to `functionSource`; its assertions stay the same.
6. **One part per release.** Each move is its own step with a failing test first (the module registers, the old functions left `app.js`, the glue line, the load order), then `npm run verify`, `npm run smoke` and `npm run check:python`.

A move never changes behavior, wording, data or storage. If a part needs a behavior change, that is a separate step.

## Done

| Step | Part | File | Release |
| --- | --- | --- | --- |
| R56 | The desktop sidebar (R47a): markup, project groups, folds, the 60 px strip | `js/sidebar-ui.js` | `2.0.0-alpha.83` |
| R110 | Drag, swipe and long press: task swipes, touch reorder, the calendar's hold-and-drag, the Navike week swipe, mouse drag and drop, drops on the sidebar and on days | `js/drag-ui.js` | `2.0.0-alpha.139` |
| R111 | Quick Add: the sheet, its preview, suggestions, place and template rows, a pasted list, its actions and typing, dictation and "Dodaj zadatak" | `js/quick-add-ui.js` | `2.0.0-alpha.140` |
| R112 | The account, 3a: the welcome screen and sign-in (e-mail and password with codes, Google and Apple, an e-mail link's message) | `js/account-ui.js` | `2.0.0-alpha.142` |
| R113 | The account, 3b: the account windows (password, e-mail address, journal password) | `js/account-ui.js` | `2.0.0-alpha.143` |

## Next parts, in order

The order goes from the most self-contained part to the most entangled one.

1. **drag** — done in R110, `js/drag-ui.js` (about 400 lines): task swipes, touch reorder, the calendar's hold-and-drag (R91), the Navike week swipe, mouse drag and drop (`handleDragStart` … `cleanupDrag`), drops on Danas, Sutra, projects and calendar days (`sidebarDropTarget`, `dropTaskOnSidebar`, `moveTaskToProject`, `dropTaskOnDay`) and long press.
   - These are event handlers, not routes or actions, so the step added two optional entries to the module contract: `attach(ctx)`, which `attachEvents` calls once on every module that has it to wire its listeners (in the order `attachEvents` used before), and `isDragging`, which `syncWaiting` asks through `callDomainHook('isDragging')` so a pulled sync waits for a drag.
   - The module takes the app's helpers once in `attach(ctx)` into its own variables, so the handlers read as they did in `app.js` and the tests that run them in `vm` with stubs still work.
   - `reorderTasks`, `reorderSubtasks` and `dropGroup` stay in `app.js`: the "Pomeri gore / dole" buttons and the subtask editor use them too.
2. **quick-add** — done in R111, `js/quick-add-ui.js` (about 425 lines): `openQuickAdd`, `renderQuickModal`, the parse preview (`quickParsePreview`), the suggestions (R90), the place and template rows, a pasted list (R90), `syncQuickDraftFromDom`, `parseQuickAddTitle`, `createTask` with `addedMessage`, and dictation (`toggleDictation`, `setDictationState`, `stopDictation`).
   - `renderModal` asks the module for the sheet (`renderRoute` with `{ type: 'modal', modalType: 'quick' }`); its buttons, the place and template sheets, the typing in its title and Enter go to its `handleAction` and `handleInput`, and its paste listener to its `attach`.
   - `app.js` keeps `openQuickAdd` as one line (`quickAddAction('quick-open', context)`, which asks the quick-add adapter alone) for its callers, the other modules and `window.TodoApp`, and asks for the dictation stop (`closeModal`), a task template (`useTemplate`) and the typed title (`openTemplatePicker`) the same way.
   - `routeQuickAddContext` stays in `app.js` with the "+" button it serves (`quickAddDirect`, `setMobileQuickAddOpen`), and so do the shared pickers that fill the sheet's draft (`target.type === 'quick'`).
3. **account** — `js/account-ui.js`: the welcome screen and sign-in, the account windows (password, e-mail, server check), signing out and deleting the account, the first-sync choice, the journal-cipher windows, and the sync itself (the sync card, `runSync` and `scheduleSync`, realtime with `connectLiveSync`). About 790 lines at R111, sharing the device's sync record (`syncMeta`) and the start-up flags with `app.js`. It moves in steps, one release each, from the most self-contained to the sync itself:
   - 3a. done in R112: the welcome screen and sign-in (`welcomeDue` … `consumeAuthRedirect`, about 230 lines). `completeSignIn` stays in `app.js` with the sync record it writes, since the e-mail change uses it too. The module reads the live state through the context (`app.state`, `app.modalState`, `app.syncMeta`, `app.modalReturnFocus`, `app.recovery`, `app.storageError`, `app.staleDataNotice`, `app.globalOperation`, with `setModalState`, `setSyncMeta`, `setModalReturnFocus`), and `app.js` asks it by name (`accountAction`): `welcome-start`, `welcome-open`, `welcome-submit`, `welcome-provider-return`, `welcome-dismiss`.
   - 3b. done in R113: the account windows, which share one form and one way to close: "Promeni lozinku" and "Promeni e-adresu" (R43: `openAccountWindow` … `accountEmailSubmit`, with `currentSession` and `closeAccountWindow`) and the journal password window (R51: `openJournalCipherWindow`, `setJournalWindow`, `journalCipherSubmit`). `app.js` asks for the sent form by name (`account-submit`); the module also reads whether a sync is running (`app.syncRunning`). The journal key helpers (`journalCipherStored` … `afterJournalSync`) stay in `app.js`, since the sync and the backups use them.
   - 3c. the sync itself: the sync card and status, `scheduleSync`, `runSync`, `applySyncResult`, the attachment list, realtime and `startSync`, with what stops or asks the sync: the server check (R42), signing out (R64), deleting the account, the first-sync choice, `completeSignIn` and the journal key helpers. It is last because the sync timer and the session touch start-up, pause and resume; those calls stay in `app.js` and go through `ctx`. The archived tasks (R103) stay in `app.js` with the state they belong to.

After these three, `app.js` keeps state, saving, routing, the shared windows and `attachEvents` (about 5,300 lines). Further parts (the task window, backups and recovery) are planned only when they are next.
