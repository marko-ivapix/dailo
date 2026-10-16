# R111 — Quick Add moves into js/quick-add-ui.js

**Date:** 2026-10-16 · **Release:** `2.0.0-alpha.140` · No data-model change. · **Plan:** `docs/superpowers/plans/2026-10-12-app-js-modules.md` (part 2, "quick-add").

**Status:** the user's request. After R110 the user said: "kreni sa drugim delom".

## The change

Nothing changes for the user. The code moves:

- **`js/quick-add-ui.js`** is a new domain module named `quick-add` (about 425 lines). It takes from `js/app.js`:
  - dictation (R53): `SpeechRecognitionImpl`, `DICTATION_ERRORS`, `toggleDictation`, `setDictationState`, `stopDictation`;
  - the sheet: `openQuickAdd`, `quickParsePreview`, `quickSuggestHtml` (R90), `renderQuickModal`, `quickPlanLabel`, `quickPlace`;
  - the template chip: `quickTemplateRow`, `quickTemplateSummary`, `openQuickTemplatePicker`, `QUICK_TEMPLATE_FIELDS`, `applyQuickTemplate`, `clearQuickTemplate`;
  - saving: `createTask`, `addedMessage`;
  - the title: `syncQuickDraftFromDom`, `parseQuickAddTitle`, `keepInQuickTitle`, `applyQuickSuggestion`, `focusQuickTitleEnd`;
  - a pasted list (R90): `handlePaste`, `createPastedTasks`, `joinPastedLines`.
- **The live data and window.** The functions keep their text, except that they read the live data and the open window through the domain context: `app.state`, `app.modalState`, and `app.setModalState(…)` where they replace the window. A sync or a reload replaces `state`, so it is never kept. The helpers it takes (`esc`, `relativeDateLabel`, `saveState` and the others) are kept in the module's own variables, filled once from the first context it receives (`use(ctx)`).
- **Its entries:**
  - `renderRoute`: the sheet for `{ type: 'modal', modalType: 'quick' }`, so `renderModal` has no Quick Add line.
  - `handleAction`:
    - the sheet's buttons: `quick-project-picker`, `quick-plan-picker`, `quick-template`, `quick-template-clear`, `quick-more-options`, `quick-keep`, `quick-suggest`, `quick-paste-tasks`, `quick-paste-one`, `create-task`, `create-task-continue`, `quick-dictate`;
    - the place and template sheets: `quick-place`, `quick-template-pick`;
    - four named calls from `app.js`: `quick-open`, `quick-stop-dictation`, `quick-template-apply`, `quick-sync-draft`.
  - `handleInput`: typing in the title (input events only) updates the preview, the suggestions and the two selectors; Enter adds the task and Shift+Enter adds it and keeps the sheet open.
  - `attach`: the paste listener.
- **`js/app.js`** keeps:
  - `const openQuickAdd = (context = {}) => quickAddAction('quick-open', context);` for its callers, the other modules (`domainContext`) and `window.TodoApp`;
  - `quickAddAction`, which asks the Quick Add module alone, by name. The smoke test showed that the other modules' `handleAction` expects a click (`event.target`), so these calls do not go through `callDomainHook`;
  - `closeModal`, `useTemplate` and `openTemplatePicker` asking for the dictation stop, a task template and the typed title;
  - `routeQuickAddContext`, with the "+" button it serves, and the shared pickers that fill the sheet's draft;
  - one new line in `domainContext()`: `getTag`, `lowerFirst`, `newTaskRecord`, `nextOrder`, `openTaskDetail`, `syncTemplateEntityGoalLinks`, `openProjectPicker`.
  - It shrinks from 7,416 to 7,057 lines.
- **Loading:** `index.html` loads the module after `js/drag-ui.js` and before `js/app.js`, and `sw.js` precaches it.
- **The plan** names the optional entries in its general recipe (`handleInput`, `attach`), how a moved part reads the live data, and how `app.js` calls into it. These are the two stale sentences the R110 review pointed out.
- **Tests:**
  - `tests/support/source.js` lists the module in `APP_FILES`, and gains:
    - `contextKeys()`: the keys of `domainContext()`. R110's test now checks its helpers against them too, which was the review's optional note;
    - `withApp(sandbox)`: an `app` that reads a vm sandbox's own `state` and `modalState`.
  - Older tests read the moved functions through `functionSource` and `appSource()`, and their harnesses get `withApp`:
    - `redesign-r4`, `-r7`, `-r12b`, `-r24`, `-r30` and `-r36`;
    - `quick-add-v1-9`, `quick-add-v1-10` and `quick-add-help-r90`;
    - `dictation-r53`, `review-fixes-r105`, `tasks-today-v1-5`, `modal-ux-v1-6` and `time-blocking-v1-12`.
  - Assertions on lines that now say `app.state` / `app.modalState`, or that moved into the module's entries, say so.
  - `search-r102` and `drag-module-r110` have the new load order, and R110's pin is "or later".
  - Each changed line has an R111 comment.
- **Pages:** Šta je novo names `2.0.0-alpha.140` in the 16 October range; there is no new line.

## Checks

- **Node:** `tests/quick-add-module-r111.test.js`, written first; it failed 6/6. It covers:
  - the moved functions and constants, and the actions, the typing, Enter and the paste listener that left `app.js`;
  - the glue;
  - the registration;
  - every helper it takes is a key of `domainContext()`;
  - no bare `state` or `modalState` in its code;
  - a run in `vm`: open, draw, type, a change that is ignored, Enter that saves into the right project and day, and a place sheet without the window;
  - the load order, the precache, `APP_FILES` and the plan;
  - the version.
- **The move itself:** with `app.` taken back out, every line that left `app.js` is in the module unchanged. The exceptions are the glue lines and the dispatch lines that became the module's entries.
- **Suites:** syntax 246/246, `npm run verify` (Node 1529/1529), `npm run smoke` (it opens Quick Add, adds a task, "Dodaj i nastavi", Back closes it), `npm run check:python` (4/4), `npm run check:links` and build (51 files).
- **Manual-pending:**
  - On a phone and a computer, Quick Add should look and behave as in `2.0.0-alpha.139`:
    - the preview and its chips;
    - #/+/@ suggestions;
    - pasting a list;
    - "Iz šablona";
    - Enter and Shift+Enter;
    - "Više opcija".
  - Dictation in Chrome or Safari.

## R111b — fixes from the review of R111

**Release:** `2.0.0-alpha.141` · No data-model change. · A read-only review of R111 (`df06979`) found one bug and one wrong sentence.

- **"Kao jedan zadatak" threw.**
  - In `joinPastedLines`, the spread `...modalState.pasteLines` was not read through the context. The module is strict and `modalState` lives only in `app.js`, so after a pasted list "Kao jedan zadatak" threw a `ReferenceError`: the title stayed, the panel stayed open. "Napravi N zadataka" was not affected.
  - Now `...app.modalState.pasteLines`.
  - R111's check for bare names took the spread's dots for a property access; it now treats only a single dot as one (`(?<![^.]\.)`), and nothing else in the module matches.
- **The plan** said that `app.js` calls a moved part through `callDomainHook('handleAction', …)`, and that `openQuickAdd` does so. Both sentences now say that it asks the module's adapter by name (`quickAddAction`), because the other modules' `handleAction` expects a click. The spec and the ledger already said so.
- **Not changed:** the review's optional note that `tests/phone-feel-r62.test.js` got a comment fix in R111 (labelled R110); it is recorded here.

### Checks

- **Node:** `tests/quick-add-paste-r111b.test.js`, written first; it failed 4/4. It covers:
  - "Kao jedan zadatak" run in the module in `vm`, without a global `modalState`;
  - the stricter check for bare names;
  - the plan;
  - the version.
- **Updated:** `tests/quick-add-module-r111.test.js` has the stricter check, and its pin is now "or later".
- **Manual-pending:** on a phone, paste a list into Quick Add and tap "Kao jedan zadatak".
