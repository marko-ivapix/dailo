# Area Knowledge and Routines Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independent Notes and Resources to Areas, Goal horizons/month view, Habit routines, and image upload in Task Properties.

**Architecture:** Keep metadata in V3 localStorage and reuse the current IndexedDB attachment store. New Notes and Resources are first-class state collections; attachment ownership is generalized without changing existing task attachment IDs or binary records. Routes and modals extend the current vanilla-JS renderer and preserve delete/Undo and recovery contracts.

**Tech Stack:** Existing HTML, CSS, vanilla JavaScript, localStorage, IndexedDB.

**Spec:** `docs/superpowers/specs/2026-09-16-area-knowledge-and-routines-prototype-design.md`

## Global Constraints

- Preserve V1.2/V1.3 semantics, IDs, Search behavior, BDS tokens, and the no-bulk-action rule.
- Use the current attachment store, 10 MB per-file limit, delete → Undo policy, backup/recovery, and no backend/dependencies.
- Area deletion clears Area references but never deletes linked entities.
- Keep overlays keyboard accessible, Escape-closeable, and focus-restoring.
- User-selected fast-prototype mode suspends new large test/review cycles. Inspect scoped diffs, run `git diff --check`, and make only focused manual preview checks when needed.

---

## File map

- `js/core.js` — V3 migration/validation of Notes, Resources, `Goal.horizon`, `Habit.routine`.
- `js/storage.js` — attachment-reference enumeration and ownership verification.
- `js/app.js` — routes, rendering, modals, starter data, delete/Undo integration.
- `css/styles.css` — only compact reusable list/detail styles.
- `README.md` — prototype usage/limits.
- `.superpowers/sdd/2026-09-16-todo-v1-3/progress.md` — ignored resumable ledger.

### Task 1: Extend V3 state and attachment ownership safely

**Files:**
- Modify: `js/core.js: invalidV3Collection, validateStateV3, migrateStateV3`
- Modify: `js/app.js: createEmptyState, normalizeState, createSampleState`
- Modify: `js/storage.js: prepareMigration and attachment-reference helpers`

**Interfaces:**
- Consumes: V3 state and legacy task attachment records `{ id, taskId, blob, size }`.
- Produces: `notes[]`, `resources[]`, normalized `goal.horizon`, `habit.routine`, and a shared attachment-owner iterator.

- [ ] Add `notes: []` and `resources: []` to empty state; normalize documented Note/Resource fields and default old Goals/Habits to `short`/`daily`.
- [ ] Extend V3 validation with explicit collections, IDs, nullable Area IDs, content strings, link/attachment arrays, valid related IDs, valid horizons, and valid routines. Reject malformed explicit V3 fields rather than dropping them.
- [ ] Implement this shared owner enumeration and use it for reference verification:

```js
function attachmentOwners(state) {
  return [
    ...state.tasks.map(item => ({ type: 'task', item })),
    ...state.notes.map(item => ({ type: 'note', item })),
    ...state.resources.map(item => ({ type: 'resource', item })),
  ];
}
```

Tasks continue to verify `record.taskId === task.id`; Note/Resource records verify `record.ownerType` plus `record.ownerId`. Missing or mismatched records abort migration/replacement without deletion.
- [ ] Never insert starter data during normalization/migration.
- [ ] Inspect scoped diff, run `git diff --check`, and commit scoped files.

### Task 2: Add Notes and Resources as first-class Area surfaces

**Files:**
- Modify: `js/app.js: parseRoute, renderSidebar, renderAreas, renderArea, modal/event dispatch`
- Modify: `css/styles.css` only for incumbent list/detail utilities

**Interfaces:**
- Consumes: Task 1 state/attachment-owner contract and existing Area modal patterns.
- Produces: `#notes`, `#note/<id>`, `#resources`, `#resource/<id>`; Area sections and contextual creation.

- [ ] Add sidebar routes without changing Search routing.
- [ ] Add Notes and Resources Area Detail sections after Habits, with counts, open controls, and `New note`/`New resource` actions that preselect the Area.
- [ ] Implement compact forms: Note title/body/links/files; Resource title/description/multiple links/files and optional Task/Project/Goal/Habit relations. Link drafts reject blank or duplicate values.
- [ ] Generalize the existing attachment add/render path to accept `{ ownerType, ownerId }`; keep the same store, file limit, count limit, and error copy.
- [ ] Extend Area delete to clear `note.areaId` and `resource.areaId`.
- [ ] Inspect scoped diff, run `git diff --check`, manually create/open/edit one Note and one multi-link Resource in the isolated preview, and commit scoped files.

### Task 3: Extend delete, Undo, backup, and recovery

**Files:**
- Modify: `js/app.js: locateDeleteEntity, buildDeleteSnapshot, restoreDeleteSnapshot, delete handlers, import/export helpers`
- Modify: `js/storage.js: attachment ownership checks used by replacement/recovery`

**Interfaces:**
- Consumes: Task 1 owner iterator and Task 2 Note/Resource shapes.
- Produces: Note/Resource confirmation → delete → Undo and retained attachments through the existing Undo deadline.

- [ ] Add `note` and `resource` branches to existing lookup/snapshot/restore paths. Snapshot the exact entity plus every referenced attachment before metadata mutation.
- [ ] Resolve current Note/Resource owners before physical attachment deletion. Reject reused attachment IDs or owner mismatches before any physical delete.
- [ ] Include Notes/Resources in global validation and referenced-attachment discovery so ZIP, reset, restore, rollback, and startup recovery retain them.
- [ ] Reuse existing actionable recovery warnings for failed binary writes/restores; never report success on uncertainty.
- [ ] Inspect scoped diff, run `git diff --check`, manually delete then Undo one Resource with an attachment in the isolated preview, and commit scoped files.

### Task 4: Add Goal horizons and the derived monthly view

**Files:**
- Create: `js/goals-ui.js`
- Modify: `index.html`
- Modify: `js/app.js: Goal adapter context and incumbent Goal extraction`
- Modify: `css/styles.css` only if current tab/section primitives cannot render the new view

**Interfaces:**
- Consumes: Task 1 `goal.horizon` and existing Goal lifecycle/progress/Calendar/reminders.
- Produces: a `goals` domain adapter, horizon picker, Short/Mid/Long sections, and a view-only `By month` grouping.

- [ ] Load `js/goals-ui.js` after the existing domain registry and before `js/app.js`. Register an adapter using the existing handled/deferred hook contract; retain state, persistence, global overlay, Search, and event listener ownership in `app.js`.
- [ ] Move existing Goal render/modal/action/input code into the adapter through an ephemeral app context, then add Short-term, Mid-term, and Long-term to Goal creation/property editing. Persist only normalized horizon; retain existing progress mode/type, target date, reminders, and history.
- [ ] Add `By month` beside existing Goal views. Group visible Goals by target-date month and include an explicit `Undated` group; do not create duplicate records or artificial dates.
- [ ] Keep Calendar, Today overdue/future behavior, completion prompt, links, and Search unchanged.
- [ ] Inspect scoped diff, run `git diff --check`, manually create one dated and one undated Goal in the isolated preview, and commit scoped files.

### Task 5: Add Habit routines and approved starter data

**Files:**
- Create: `js/habits-ui.js`
- Modify: `index.html`
- Modify: `js/app.js: Habit adapter context and incumbent Habit extraction; starter-data action`
- Modify: `css/styles.css` only for BDS section labels/list spacing
- Modify: `README.md: prototype sample-data note`

**Interfaces:**
- Consumes: Task 1 `habit.routine` and current Habit schedule/check-in/reminder/lifecycle logic.
- Produces: a `habits` domain adapter, Morning/Daily/Night selection/grouping, and a safe idempotent starter-data action.

- [ ] Load `js/habits-ui.js` after the existing domain registry and before `js/app.js`. Register an adapter using the existing handled/deferred hook contract; retain state, persistence, global overlay, Search, and event listener ownership in `app.js`.
- [ ] Move existing Habit render/modal/action/input code into the adapter through an ephemeral app context, then add Routine picker to Habit create/edit. Group active Habits by routine on Habits; preserve Today schedule-first order and show only a compact routine label.
- [ ] Add one `Add starter examples` action in Settings or an empty state. It creates only missing stable-marked items: Family & Friends, Work, Personal Growth, Home, Travel, Health, Career, Finance, plus approved Morning/Daily/Night Habits. It never overwrites or duplicates user edits.
- [ ] Apply daily schedules to everyday items and `X times per week = 4` to training. Keep every inserted record editable.
- [ ] Inspect scoped diff, run `git diff --check`, invoke starter action twice in the isolated preview to confirm idempotence, and commit scoped files.

### Task 6: Make image upload explicit in Task Properties and finish the handoff

**Files:**
- Modify: `js/app.js: renderTaskModal, attachment input/handler copy`
- Modify: `README.md`

**Interfaces:**
- Consumes: existing `addAttachments(taskId, files)` and all prior attachment ownership behavior.
- Produces: image-specific upload control in Task Properties while generic attachments retain their current lifecycle.

- [ ] Retain the existing generic file drop zone and add an image control with `accept="image/*"`; both call the same attachment validation/write path.
- [ ] Place the attachment controls under a clear `Task properties` heading without changing title, notes, schedule, tags, priority, reminder, recurrence, subtasks, delete, menus, Escape, or focus behavior.
- [ ] Update README with the new surfaces and the fast-prototype verification limitation.
- [ ] Inspect final diff/status, run `git diff --check`, attach an image through Task Properties in the isolated preview, commit scoped files, and record exact handoff/deferrals in the SDD ledger.

## Self-review

- Notes/Resources map to Tasks 1–3; Task image upload maps to Task 6; Areas to Tasks 2/5; Goals to Task 4; Habits/sample routines to Task 5.
- No task adds Search changes, bulk actions, backend/cloud, rich text, ratings, tags, or another binary store.
- Names are consistent: `notes`, `resources`, `horizon`, `routine`, `ownerType`, and `ownerId`.
- User-selected prototype verification never authorizes weakening migration, Undo, backup, or recovery behavior.
