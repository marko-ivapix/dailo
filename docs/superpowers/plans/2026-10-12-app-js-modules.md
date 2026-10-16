# Splitting js/app.js into modules

**Date:** 2026-10-12 · **Status:** the user's request (improvement 8, "moze sve"); the first step shipped as R56 (`2.0.0-alpha.83`). On 2026-10-16 the user said "da, kreni sa prvim delom", and part 1 (drag) shipped as R110 (`2.0.0-alpha.139`). · **Spec:** `docs/superpowers/specs/2026-10-12-r56-app-modules.md`.

## Why

`js/app.js` holds about 6,900 lines: state, rendering, every window and every event. The screens already left it as domain modules (`js/today-ui.js`, `js/calendar-ui.js`, `js/habits-ui.js` and the others). What is left is shared machinery, and a change to one part still means reading a very long file. The goal is smaller files with one job each, without a bundler and without changing what the app does.

## How a part moves

Every part moves the same way the screens did:

1. **A domain module.** The part becomes `js/<name>-ui.js`, an IIFE that registers through `window.TodoDomainModules?.register({ name, renderRoute, handleAction })`. `renderRoute` answers its own route types (for example `{ type: 'sidebar' }`), and `handleAction` answers its own `data-action` values and returns `true`.
2. **What it needs comes through `domainContext`.** The module gets the app's state and helpers from `ctx` (one line per group in `domainContext()`). Nothing in the module reaches into `app.js` variables directly, and nothing new goes onto `window`.
3. **`app.js` keeps only the glue.** It asks for markup through `callDomainHook('renderRoute', …)` and passes actions on through `callDomainHook('handleAction', …)`. Keyboard shortcuts and event wiring stay in `attachEvents`.
4. **Load order.** The script tag goes after the other modules and before `js/app.js` in `index.html`, and the file joins the precache list in `sw.js` (so `npm run build` copies it into `www/` for Capacitor).
5. **Tests keep working.** `tests/support/source.js` finds a function wherever it lives: `functionSource(name)` searches every `js/*.js` file, and `appSource()` reads `app.js` together with the modules split out of it (`APP_FILES`, in load order). A test that sliced a moved function out of `app.js` switches to `functionSource`; its assertions stay the same.
6. **One part per release.** Each move is its own step with a failing test first (the module registers, the old functions left `app.js`, the glue line, the load order), then `npm run verify`, `npm run smoke` and `npm run check:python`.

A move never changes behavior, wording, data or storage. If a part needs a behavior change, that is a separate step.

## Done

| Step | Part | File | Release |
| --- | --- | --- | --- |
| R56 | The desktop sidebar (R47a): markup, project groups, folds, the 60 px strip | `js/sidebar-ui.js` | `2.0.0-alpha.83` |
| R110 | Drag, swipe and long press: task swipes, touch reorder, the calendar's hold-and-drag, the Navike week swipe, mouse drag and drop, drops on the sidebar and on days | `js/drag-ui.js` | `2.0.0-alpha.139` |

## Next parts, in order

The order goes from the most self-contained part to the most entangled one.

1. **drag** — done in R110, `js/drag-ui.js` (about 400 lines): task swipes, touch reorder, the calendar's hold-and-drag (R91), the Navike week swipe, mouse drag and drop (`handleDragStart` … `cleanupDrag`), drops on Danas, Sutra, projects and calendar days (`sidebarDropTarget`, `dropTaskOnSidebar`, `moveTaskToProject`, `dropTaskOnDay`) and long press.
   - These are event handlers, not routes or actions, so the step added two optional entries to the module contract: `attach(ctx)`, which `attachEvents` calls once on every module that has it to wire its listeners (in the order `attachEvents` used before), and `isDragging`, which `syncWaiting` asks through `callDomainHook('isDragging')` so a pulled sync waits for a drag.
   - The module takes the app's helpers once in `attach(ctx)` into its own variables, so the handlers read as they did in `app.js` and the tests that run them in `vm` with stubs still work.
   - `reorderTasks`, `reorderSubtasks` and `dropGroup` stay in `app.js`: the "Pomeri gore / dole" buttons and the subtask editor use them too.
2. **quick-add** — `js/quick-add-ui.js` (about 350 lines): `openQuickAdd`, `renderQuickModal`, the parse preview, the place and template rows, `syncQuickDraftFromDom`, `parseQuickAddTitle`, `routeQuickAddContext` and dictation (`toggleDictation`, `setDictationState`, `stopDictation`). `renderModal` asks the module for the Quick Add sheet the way it asks the screens for routes.
3. **account** — `js/account-ui.js` (about 650 lines, `app.js` lines ~4430–5075 at R56): the sync card, `runSync` and `scheduleSync`, realtime (`connectLiveSync`), the welcome screen and sign-in, the account windows (password, e-mail, server check), the first-sync choice and the journal-cipher windows. It is last because the sync timer and the session touch start-up, pause and resume; those calls stay in `app.js` and go through `ctx`.

After these three, `app.js` keeps state, saving, routing, the shared windows and `attachEvents` (about 5,300 lines). Further parts (the task window, backups and recovery) are planned only when they are next.
