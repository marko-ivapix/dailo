# V1.3 Acceptance Checklist

This is a human-readable release gate. A feature is accepted only when behavior is demonstrated in the current build, not merely present in source code.

## Migration / persistence

- [ ] Opening valid V1.2 data upgrades to V3 without losing tasks, projects, tags, reminders, recurrence, attachments, ordering or settings.
- [ ] Migration failure does not silently reset data.
- [ ] V3 state reloads correctly after browser refresh.
- [ ] Habit logs persist in IndexedDB.
- [ ] Goal history persists in IndexedDB.

## Areas

- [ ] Area can be created with name/color/icon.
- [ ] Area can be edited.
- [ ] Area can be pinned/unpinned.
- [ ] Area can be archived/restored.
- [ ] Area Detail shows Projects, standalone Tasks, Goals and Habits.
- [ ] New objects created from Area Detail inherit the Area.
- [ ] Deleting Area requires confirmation, preserves linked objects, clears links, then supports Undo restoring them.

## Goals

- [ ] Manual % Goal works.
- [ ] Numeric Goal works with target/unit.
- [ ] Linked Tasks Goal computes equal-weight task progress.
- [ ] Subtasks are not counted separately.
- [ ] Project allTasks mode includes future tasks added to that Project.
- [ ] Project selectedTasks mode counts only selected tasks.
- [ ] Direct Goal ↔ Task link survives moving the task to another Project.
- [ ] One Task can link to multiple Goals.
- [ ] Goal can link to multiple Habits.
- [ ] Each Habit link may choose metric/target.
- [ ] Habit contribution is capped at 100%.
- [ ] Goal at 100% prompts Keep active / Mark completed.
- [ ] Paused Goal is not overdue.
- [ ] Resuming past-due Goal makes it overdue.
- [ ] Future Active Goal appears in Upcoming.
- [ ] Goal reminder points fire only as configured and do not spam after target date.
- [ ] Milestones can be added/edited/completed/deleted with global delete policy.
- [ ] Dated milestones appear in Calendar.
- [ ] Past incomplete milestones appear in Today Overdue Milestones.
- [ ] Goal history records meaningful changes.

## Habits

- [ ] Checkbox Habit supports Done/Skipped/Missed.
- [ ] Numeric Habit supports quick increments and direct total edit.
- [ ] Numeric Habit becomes Done at/above target.
- [ ] Daily schedule behaves correctly.
- [ ] Selected weekdays behave correctly.
- [ ] X-times-per-week behaves correctly.
- [ ] Every-N-days behaves correctly.
- [ ] Past dates can be edited; future dates cannot.
- [ ] Skipped does not break streak according to spec.
- [ ] Paused periods do not break streak.
- [ ] X-times-per-week streak is successful-week based.
- [ ] Weekly progress resets to 0/N next week.
- [ ] Extra weekly check-ins are kept in statistics.
- [ ] Repeat automatically works.
- [ ] Ask each period prompts at the correct boundary.
- [ ] One period only ends correctly.
- [ ] On-date and successful-period end conditions work.
- [ ] Multiple reminders can be saved.
- [ ] X-times-per-week reminders stop after target is reached.
- [ ] Snooze 15m/1h/Tonight works.
- [ ] Heatmap and history represent logs correctly.
- [ ] Delete Habit confirmation + Undo restores logs/reminders/Goal links.

## Today / Upcoming

- [ ] Existing Today tasks/overdue behavior remains intact.
- [ ] Scheduled Habits appear in Today.
- [ ] X-times-per-week Habit remains in Today all week, even after target.
- [ ] Goal due today appears in Today Goals.
- [ ] Past Active Goal appears in Overdue Goals.
- [ ] Past incomplete milestone appears in Overdue Milestones.
- [ ] Future Active Goals appear in Upcoming.
- [ ] Habits do not populate Upcoming.

## Calendar

- [ ] Week view is seven columns, not an hourly time-block grid.
- [ ] All-day and timed entries sort correctly.
- [ ] Task plannedTime and dueTime are independent.
- [ ] Task planned event appears on planned date.
- [ ] Task due event appears on due date.
- [ ] Same-day planned/due task appears once with both values.
- [ ] Scheduled Habits appear.
- [ ] Goal target dates appear.
- [ ] Goal milestones appear.
- [ ] Dragging Task changes plannedDate and preserves plannedTime.
- [ ] Dragging Goal changes targetDate.
- [ ] Habit cannot be dragged to alter schedule.
- [ ] Month navigation uses true calendar months.
- [ ] Month cells show compact counts.
- [ ] Clicking Month day opens Day Detail.
- [ ] Day Detail quick actions work.
- [ ] Calendar can create Task/Goal/Habit with selected-date defaults.
- [ ] Show/hide filters work for Tasks/Habits/Goals/Milestones.

## Templates

- [ ] Task template create/edit/delete/duplicate works.
- [ ] Project template creates a new Project and independent new Task instances.
- [ ] Habit template creates a new Habit without prior history/streak.
- [ ] Goal template creates a new Goal without old progress/history/item links.
- [ ] Save as template works from all four supported object types.
- [ ] Template is a snapshot, not a live reference.
- [ ] Relative dates resolve from instantiation time.

## Saved Views

- [ ] Task Saved View filters Project/Area/Tag/Priority/date/completion correctly.
- [ ] Goal Saved View filters Area/Status/Target date correctly.
- [ ] Habit Saved View filters Area/Status correctly.
- [ ] Add/Edit/Delete/Duplicate works.
- [ ] Pin/unpin works.
- [ ] Each view targets exactly one object type.

## Sidebar / keyboard

- [ ] Final module groups are present.
- [ ] Group collapse state persists.
- [ ] Pinned Areas render.
- [ ] Pinned Views render.
- [ ] Default shortcuts work.
- [ ] Custom remap works.
- [ ] Shortcut conflicts are rejected clearly.
- [ ] Reset-to-default shortcuts works.
- [ ] Shortcuts do not fire while editing text/form controls.

## Recurring tasks

- [ ] Pause/resume works.
- [ ] Skip next occurrence works exactly once.
- [ ] End recurrence works.
- [ ] End-on-date works.
- [ ] End-after-N works.
- [ ] This occurrence edits one instance only.
- [ ] This and future preserves past instances and creates correct future-series behavior.

## Delete / destructive safety

- [ ] Every normal entity delete opens confirmation.
- [ ] Every confirmed normal entity delete provides Undo.
- [ ] Undo restores complete relevant snapshot.
- [ ] Attachments are not physically destroyed before Undo expiry.
- [ ] Reset downloads safety backup.
- [ ] Reset creates internal recovery snapshot.
- [ ] Reset requires typed `RESET`.
- [ ] Restore/Replace downloads safety backup.
- [ ] Restore/Replace creates internal recovery snapshot.
- [ ] Restore requires typed `RESTORE`.
- [ ] Failed Reset/Restore rolls back.
- [ ] Clear Completed confirms and supports Undo.

## Regression constraints

- [ ] Search still behaves as V1.2 specified.
- [ ] No bulk-selection/bulk-action UI was added.
- [ ] Existing Tags/Priority/Attachments functionality still works.
- [ ] Existing Inbox/Today/Upcoming/Anytime/Projects/Completed behavior still works unless V1.3 explicitly extends it.
- [ ] Existing V1.2 backup data can be safely handled according to the approved migration/backup design.

## Release gate

Do not label the build “V1.3 complete” until:

1. Every applicable checklist item above is green.
2. Full automated tests pass in one fresh run.
3. Browser smoke tests pass in one fresh run.
4. V1.1/V1.2 regression tests pass.
5. README reports V1.3 rather than V1.2.
6. Final distributable ZIP is produced from the verified working tree.
