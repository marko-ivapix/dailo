# Progressive UI Module Extraction Plan

**Goal:** Split cohesive, independently editable UI domains from `js/app.js` while keeping one state/persistence/event authority.

**Spec:** `docs/superpowers/specs/2026-09-16-progressive-ui-module-extraction-design.md`

**Prototype constraint:** retain the user-approved fast-prototype path: no new test suite/review cycle, but inspect the source scope and run `git diff --check` before each commit.

## Task 1 — Saved Views adapter

**Files:** create `js/saved-views-ui.js`; modify `index.html`, `js/app.js`.

- [ ] Extend the ephemeral app context only with Saved-View render and command callbacks.
- [ ] Extract Saved Views list/detail/modal/filter HTML plus its existing actions and type-change behavior into the adapter.
- [ ] Preserve delete confirmation/Undo by routing deletion through `requestDeleteEntity`.
- [ ] Remove the matching `app.js` fallback surface; keep sidebar, state and global overlay ownership in `app.js`.
- [ ] Inspect scoped diff and run `git diff --check`; update the SDD ledger and commit.

## Task 2 — Projects adapter

**Files:** create `js/projects-ui.js`; modify `index.html`, `js/app.js`.

- [ ] Extract Project list/detail/archived/modal/menu UI through callbacks only.
- [ ] Retain template materialization, task linkage, delete/Undo and drag ownership in app commands.
- [ ] Inspect scoped diff and run `git diff --check`; update ledger and commit.

## Task 3 — Areas adapter

**Files:** create `js/areas-ui.js`; modify `index.html`, `js/app.js`.

- [ ] Extract Area list/detail/modal/menu/lifecycle UI through callbacks only.
- [ ] Keep Area-linked cross-domain creation delegated to existing Goal/Habit/Task/Project entrypoints.
- [ ] Inspect scoped diff and run `git diff --check`; update ledger and commit.

## Task 4 — Settings and Templates adapters

**Files:** create `js/settings-ui.js`, `js/templates-ui.js`; modify `index.html`, `js/app.js`.

- [ ] Extract only Settings display/shortcut controls; preserve backup/import/reset/recovery app commands.
- [ ] Extract Template list/editor UI; preserve cross-domain application bridges in app.
- [ ] Inspect scoped diffs and run `git diff --check`; update ledger and commit per module.

## Task 5 — Calendar and Task UI adapters

**Files:** create `js/calendar-ui.js`, `js/tasks-ui.js`; modify `index.html`, `js/app.js`.

- [ ] Add a synchronous, narrow calendar drag delegation seam before extracting Calendar UI.
- [ ] Add an app `renderTaskRow` delegator before extracting Task presentation/modal UI.
- [ ] Retain attachment, recurrence, delete/Undo, recovery and global listener ownership in app.
- [ ] Inspect scoped diffs and run `git diff --check`; update ledger and commit each safe slice.
