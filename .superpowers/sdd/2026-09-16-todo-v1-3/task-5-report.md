# Task 5 — Goals, Progress Engines, Milestones, Reminders, and History

## RED evidence

The pure Goal contract tests were added before implementation and run with:

```text
node --test tests/core-v1-3.test.js
```

Result before the Goal helper implementation: 16 passes and 5 expected failures. Each failure was a missing public API, including:

```text
TypeError: Core.computeGoalProgress is not a function
TypeError: Core.isGoalOverdue is not a function
```

The failing tests cover direct/Project task membership, dynamic `allTasks` growth, equal/capped Habit contributions, manual percentage clamping with source preservation, and Goal date/reminder/milestone behavior.

## GREEN evidence

Pure, storage, and V1.2 core regression:

```text
node --test tests/core.test.js tests/core-v1-3.test.js tests/storage-v1-3.test.js
```

Result: 43 passes, 0 failures.

Syntax verification:

```text
node --check js/core.js
node --check js/app.js
```

Result: both exited 0.

Goals/Areas browser contract:

```text
PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-3-areas-goals.py
```

Result: exited 0. The test covers manual Goal creation, 100% Keep active prompt, linked Project task growth, equal-weight linked Habit metrics, pause/resume overdue semantics, overdue dated Milestones, reminder persistence, Goal history events, archive/restore, and delete/Undo. The pre-existing Area contract remains in the same suite.

V1.2 and migration browser regression:

```text
PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-2-smoke.py
PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-2-lifecycle.py
PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-3-migration.py
```

Result: all exited 0. Playwright required the permitted unsandboxed local Chrome launch on this host.

## Delivered behavior

- Added `computeGoalProgress`, `isGoalOverdue`, `goalReminderMoments`, and `overdueMilestones` to `TodoCore`.
- Added `#goals` and `#goal/<id>` with Goal creation, detail, inline manual progress update, lifecycle, Project/Task/Habit linking, Milestones, shared-time reminders, and archive/restore/delete+Undo controls.
- Persisted only specified significant Goal history events through `TodoStorage.goalHistory`.
- Goal deletion clears Task/Project/Habit backlinks, deletes history, and restores both links and history through Undo.
- Preserved V1.2 Search, static-browser architecture, no-bulk behavior, and the established brand tokens.

## Commit

- `c44a8d2 feat: add goals progress milestones and history`

## Concerns / handoff

- Task 6 remains the owner of durable Habit-log metric derivation. This UI intentionally consumes the future-facing `state.habitMetrics` snapshot rather than making `core.js` call IndexedDB.
- Task 7 remains the composition owner for Today/Upcoming Goal group rendering. This task provides canonical Goal overdue/future predicates without changing existing V1.2 task-only Today/Upcoming derivation.
- Browser notifications/scheduling are not present in the existing app; reminder points are persisted and derived, with the no-post-target-date invariant represented by finite pre-target/on-target moments.

---

## Fix round 1/5 — selected Project Tasks, automatic completion evaluation, reminders, and Milestone edit

### RED evidence

The following pure reminder contract was added before its helper existed:

```text
node --test tests/core-v1-3.test.js
```

Result: 21 passes and 1 expected failure:

```text
TypeError: Core.goalReminderDueMoments is not a function
```

The extended browser contract also specified selected-Project Task checkboxes, linked Task completion prompting, single-fire reminder recording, post-target suppression, and Milestone editing before the corresponding UI/action paths were added.

### GREEN evidence

```text
node --check js/core.js
node --check js/app.js
node --test tests/core.test.js tests/core-v1-3.test.js tests/storage-v1-3.test.js
PYTHONPATH=tests/browser_test_support .venv/bin/python -u tests/ui-v1-3-areas-goals.py
```

Result: syntax checks passed; Node reports 44 passes and 0 failures; the expanded Playwright Areas/Goals suite exited 0.

### Delivered fixes

- `selectedTasks` Project links now render and persist an in-Project Task picker. Existing selected IDs are preserved on reopen/save and only changed through that picker.
- Added reusable `captureGoalProgress` / `evaluateGoalProgressChanges` app hooks. Task completion and Goal link changes now record progress deltas and show the 100% Keep active / Mark completed prompt when a linked Goal crosses the threshold. The hook is exposed for Task 6 Habit check-ins.
- Added pure `goalReminderDueMoments` and integrated Goal reminders into the normal app reminder sweep. Due moments are recorded in `reminderFiredMoments`, fire once, honor shared times and enabled 7/3/1/on-target points, and never fire after target date.
- Added small scoped Milestone editing while keeping the existing completion/delete+Undo flow.

### Commit

- `1e29ca3 fix: complete goal links prompts and reminders`

### Concerns / handoff

- Goal reminder delivery currently uses the app's existing periodic/focus reminder sweep and optional browser notification mechanism; no background service worker exists in this static app.
- A selected Project Task picker correctly scopes tasks to its Project. If Task 6 changes entity-ID conventions to include unusual CSS selector characters, its IDs should remain passed through `CSS.escape` as this UI does.
