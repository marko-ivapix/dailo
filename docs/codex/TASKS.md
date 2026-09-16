# Codex Task Checklist — V1.3

**Important:** This checklist intentionally starts unchecked. Codex must inspect the actual working tree and run fresh tests before marking an item complete. Prior chat claims are not evidence.

Full plan: `docs/superpowers/plans/2026-09-16-todo-v1-3.md`

## Phase 0 — Repository audit

- [ ] Inspect current file tree and identify actual runtime modules/tests.
- [ ] Read `AGENTS.md`.
- [ ] Read the V1.3 design spec.
- [ ] Read the V1.3 implementation plan.
- [ ] Run the complete existing V1.2 baseline/regression suite.
- [ ] Record any baseline failures before changing production code.

## Phase 1 — Schema V3 and migration

- [ ] Add/verify schema version 3.
- [ ] Add V1.3 default fields to Task and Project.
- [ ] Add global collections for Areas, Goals, Habits, Templates, Saved Views.
- [ ] Preserve all V1.2 fields/data during migration.
- [ ] Add migration validation and failure behavior.
- [ ] Prove migration with tests.

## Phase 2 — IndexedDB V3 storage

- [ ] Preserve attachment storage compatibility.
- [ ] Add Habit log store.
- [ ] Add Goal history store.
- [ ] Add recovery snapshot store.
- [ ] Add CRUD helpers and transaction/error handling.
- [ ] Test persistence independently from UI.

## Phase 3 — Areas

- [ ] Areas route/sidebar entry.
- [ ] Add Area.
- [ ] Edit Area.
- [ ] Archive/Restore Area.
- [ ] Delete Area with confirmation + Undo.
- [ ] Pin/unpin Area.
- [ ] Area Detail with Projects/standalone Tasks/Goals/Habits.
- [ ] Context creation from Area Detail.
- [ ] Project Area inheritance for task behavior.

## Phase 4 — Goals

- [ ] Goal route/list/filters.
- [ ] New Goal basic flow + More section.
- [ ] Goal Detail.
- [ ] Manual percentage progress.
- [ ] Manual numeric progress.
- [ ] Linked Task progress.
- [ ] Project `allTasks` contribution.
- [ ] Project `selectedTasks` contribution.
- [ ] Direct Goal ↔ Task links.
- [ ] Linked Habit progress with per-Habit metric/target.
- [ ] Equal Habit weighting and 100% contribution cap.
- [ ] 100% Goal reached prompt.
- [ ] Active/Paused/Completed/Archived lifecycle.
- [ ] Target date + overdue behavior.
- [ ] Goal reminders.
- [ ] Milestones.
- [ ] Overdue milestones.
- [ ] Goal history.
- [ ] Delete confirmation + Undo restores links/history/milestones.

## Phase 5 — Habits

- [ ] Habit route/list/filters.
- [ ] New Habit basic flow + More section.
- [ ] Habit Detail.
- [ ] Checkbox tracking.
- [ ] Numeric tracking.
- [ ] Quick numeric increments.
- [ ] Direct numeric total edit.
- [ ] Daily schedule.
- [ ] Selected weekdays schedule.
- [ ] X times/week schedule.
- [ ] Every N days schedule.
- [ ] Done/Skipped/Missed logs.
- [ ] Historical edit behavior.
- [ ] Current/longest streak.
- [ ] Total check-ins/completion rate.
- [ ] X-times-per-week weekly reset + extra check-ins.
- [ ] Continuation modes.
- [ ] End conditions.
- [ ] Multiple reminder times.
- [ ] Reminder snooze.
- [ ] Weekly reminder suppression after target reached.
- [ ] Heatmap + history list.
- [ ] Active/Paused/Archived lifecycle.
- [ ] Goal linking.
- [ ] Delete confirmation + Undo restores history/reminders/links.

## Phase 6 — Today and Upcoming

- [ ] Today Habits section.
- [ ] Today Goals due today.
- [ ] Today Overdue Goals section.
- [ ] Today Overdue Milestones section.
- [ ] Existing task Today behavior remains intact.
- [ ] Upcoming future Goals section.
- [ ] Confirm Habits do not appear in Upcoming.

## Phase 7 — Calendar

- [ ] Calendar route.
- [ ] Week view with seven columns.
- [ ] All-day/timed ordering.
- [ ] Task plannedTime and dueTime.
- [ ] Planned and Due representations.
- [ ] Same-day Planned+Due merged display.
- [ ] Goals on targetDate.
- [ ] Habits on scheduled dates.
- [ ] Milestones on dated milestones.
- [ ] Task date drag.
- [ ] Goal target-date drag.
- [ ] Habit non-draggable rule.
- [ ] Month grid and true month navigation.
- [ ] Month summary counts.
- [ ] Day Detail.
- [ ] Day Detail quick actions.
- [ ] Calendar create Task/Goal/Habit.
- [ ] Calendar visibility filters.

## Phase 8 — Templates

- [ ] Templates route.
- [ ] Task templates.
- [ ] Project templates with predefined tasks.
- [ ] Habit templates.
- [ ] Goal templates.
- [ ] Add/Edit/Delete/Duplicate.
- [ ] Save as template from all supported objects.
- [ ] Relative-date resolution.
- [ ] Verify history/current-progress exclusions.

## Phase 9 — Saved Views/sidebar/shortcuts

- [ ] Saved Views route.
- [ ] Task filters.
- [ ] Goal filters.
- [ ] Habit filters.
- [ ] Add/Edit/Delete/Duplicate.
- [ ] Pin/unpin.
- [ ] Final sidebar groups.
- [ ] Collapsible group persistence.
- [ ] Pinned Areas.
- [ ] Pinned Views.
- [ ] Default keyboard shortcuts.
- [ ] Shortcut remapping.
- [ ] Conflict validation.
- [ ] Reset shortcut defaults.

## Phase 10 — Advanced recurring tasks

- [ ] Pause recurrence.
- [ ] Resume recurrence.
- [ ] Skip next occurrence.
- [ ] End recurrence.
- [ ] End on date.
- [ ] End after N occurrences.
- [ ] Edit recurrence.
- [ ] This occurrence scope.
- [ ] This and future scope.
- [ ] Verify previous occurrences unchanged.

## Phase 11 — Universal deletion

- [ ] Route all deletions through shared confirmation behavior.
- [ ] Route all deletions through shared Undo snapshot behavior.
- [ ] Verify Task/Subtask/Project/Tag/Area/Goal/Habit/Milestone/Attachment/Template/SavedView.
- [ ] Verify attachment Blob retention during Undo window.
- [ ] Verify complete relation/history restoration.

## Phase 12 — Backup/recovery V1.3

- [ ] V1.3 ZIP includes all V3 metadata.
- [ ] Include attachments.
- [ ] Include Habit logs.
- [ ] Include Goal history.
- [ ] Validate V2/V3 compatibility where required by spec.
- [ ] Reset creates safety ZIP + recovery snapshot + typed RESET confirmation.
- [ ] Restore creates safety ZIP + recovery snapshot + typed RESTORE confirmation.
- [ ] Roll back failed replacement.
- [ ] Clear Completed confirmation + Undo.

## Phase 13 — Cross-module quality

- [ ] Keyboard focus/escape behavior.
- [ ] Modal focus traps.
- [ ] Reduced-motion support.
- [ ] Empty states.
- [ ] Storage errors surfaced without silent reset.
- [ ] Multi-tab storage update behavior remains valid.
- [ ] Search behavior is unchanged from V1.2.
- [ ] No bulk-selection UI exists.

## Phase 14 — Final verification

- [ ] Run syntax/lint checks used by the project.
- [ ] Run all core unit tests.
- [ ] Run storage tests.
- [ ] Run every browser/integration smoke test.
- [ ] Run V1.1/V1.2 regression tests.
- [ ] Walk every acceptance item in `docs/codex/ACCEPTANCE.md`.
- [ ] Update README from V1.2 to V1.3.
- [ ] Ensure source docs and runtime version agree.
- [ ] Package final V1.3 ZIP only after fresh green verification.
