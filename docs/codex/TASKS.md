# Codex Task Checklist — V1.3

**Important:** This checklist intentionally starts unchecked. Codex must inspect the actual working tree and run fresh tests before marking an item complete. Prior chat claims are not evidence.

Full plan: `docs/superpowers/plans/2026-09-16-todo-v1-3.md`

## Phase 0 — Repository audit

- [x] Inspect current file tree and identify actual runtime modules/tests.
- [x] Read `AGENTS.md`.
- [x] Read the V1.3 design spec.
- [x] Read the V1.3 implementation plan.
- [x] Run the complete existing V1.2 baseline/regression suite.
- [x] Record any baseline failures before changing production code.

## Phase 1 — Schema V3 and migration

- [x] Add/verify schema version 3.
- [x] Add V1.3 default fields to Task and Project.
- [x] Add global collections for Areas, Goals, Habits, Templates, Saved Views.
- [x] Preserve all V1.2 fields/data during migration.
- [x] Add migration validation and failure behavior.
- [x] Prove migration with tests.

## Phase 2 — IndexedDB V3 storage

- [x] Preserve attachment storage compatibility.
- [x] Add Habit log store.
- [x] Add Goal history store.
- [x] Add recovery snapshot store.
- [x] Add CRUD helpers and transaction/error handling.
- [x] Test persistence independently from UI.

## Phase 3 — Areas

- [x] Areas route/sidebar entry.
- [x] Add Area.
- [x] Edit Area.
- [x] Archive/Restore Area.
- [x] Delete Area with confirmation + Undo.
- [x] Pin/unpin Area.
- [x] Area Detail with Projects/standalone Tasks/Goals/Habits.
- [x] Context creation from Area Detail.
- [x] Project Area inheritance for task behavior.

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

- [x] Habit route/list/filters.
- [x] New Habit basic flow + More section.
- [x] Habit Detail.
- [x] Checkbox tracking.
- [x] Numeric tracking.
- [x] Quick numeric increments.
- [x] Direct numeric total edit.
- [x] Daily schedule.
- [x] Selected weekdays schedule.
- [x] X times/week schedule.
- [x] Every N days schedule.
- [x] Done/Skipped/Missed logs.
- [x] Historical edit behavior.
- [x] Current/longest streak.
- [x] Total check-ins/completion rate.
- [x] X-times-per-week weekly reset + extra check-ins.
- [x] Continuation modes.
- [x] End conditions.
- [x] Multiple reminder times.
- [x] Reminder snooze.
- [x] Weekly reminder suppression after target reached.
- [x] Heatmap + history list.
- [x] Active/Paused/Archived lifecycle.
- [x] Goal linking.
- [x] Delete confirmation + Undo restores history/reminders/links.

## Phase 6 — Today and Upcoming

- [x] Today Habits section.
- [x] Today Goals due today.
- [x] Today Overdue Goals section.
- [x] Today Overdue Milestones section.
- [x] Existing task Today behavior remains intact.
- [x] Upcoming future Goals section.
- [x] Confirm Habits do not appear in Upcoming.

## Phase 7 — Calendar

- [x] Calendar route.
- [x] Week view with seven columns.
- [x] All-day/timed ordering.
- [x] Task plannedTime and dueTime.
- [x] Planned and Due representations.
- [x] Same-day Planned+Due merged display.
- [x] Goals on targetDate.
- [x] Habits on scheduled dates.
- [x] Milestones on dated milestones.
- [x] Task date drag.
- [x] Goal target-date drag.
- [x] Habit non-draggable rule.
- [x] Month grid and true month navigation.
- [x] Month summary counts.
- [x] Day Detail.
- [x] Day Detail quick actions.
- [x] Calendar create Task/Goal/Habit.
- [x] Calendar visibility filters.

## Phase 8 — Templates

- [x] Templates route.
- [x] Task templates.
- [x] Project templates with predefined tasks.
- [x] Habit templates.
- [x] Goal templates.
- [x] Add/Edit/Delete/Duplicate.
- [x] Save as template from all supported objects.
- [x] Relative-date resolution.
- [x] Verify history/current-progress exclusions.

## Phase 9 — Saved Views/sidebar/shortcuts

- [x] Saved Views route.
- [x] Task filters.
- [x] Goal filters.
- [x] Habit filters.
- [x] Add/Edit/Delete/Duplicate.
- [x] Pin/unpin.
- [x] Final sidebar groups.
- [x] Collapsible group persistence.
- [x] Pinned Areas.
- [x] Pinned Views.
- [x] Default keyboard shortcuts.
- [x] Shortcut remapping.
- [x] Conflict validation.
- [x] Reset shortcut defaults.

## Phase 10 — Advanced recurring tasks

- [x] Pause recurrence.
- [x] Resume recurrence.
- [x] Skip next occurrence.
- [x] End recurrence.
- [x] End on date.
- [x] End after N occurrences.
- [x] Edit recurrence.
- [x] This occurrence scope.
- [x] This and future scope.
- [x] Verify previous occurrences unchanged.

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
