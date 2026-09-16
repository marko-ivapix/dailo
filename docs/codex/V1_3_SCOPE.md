# V1.3 Required Scope

This document is a condensed feature inventory. Detailed semantics live in the full design spec:

`docs/superpowers/specs/2026-09-15-todo-v1-3-design.md`

## 1. Schema V3 + migration

- Safe V1.2 → V1.3 migration.
- Existing V1.2 data preserved.
- New Task defaults: `areaId`, `goalIds`, `plannedTime`, `dueTime`.
- New Project defaults: `areaId`, `goalIds`.
- New global collections: `areas`, `goals`, `habits`, `templates`, `savedViews`.
- No silent reset on migration failure.

## 2. Storage V3

- localStorage for compact current state.
- IndexedDB for attachments, Habit logs, Goal history and recovery snapshots.
- Existing attachment compatibility preserved.

## 3. Areas

- Add / Edit / Delete / Archive / Restore.
- name + color + icon.
- pin/unpin sidebar.
- optional Area links for Project, Goal, Habit and standalone Task.
- Area Detail sections:
  - Projects
  - standalone Tasks
  - Goals
  - Habits
- contextual creation from Area Detail.
- deleting Area clears links but never deletes linked objects.

## 4. Goals

- Add/Edit/Delete with global confirmation+Undo delete policy.
- Area optional.
- statuses: Active / Paused / Completed / Archived.
- progress modes:
  - manual
  - linkedTasks
  - linkedHabits
- progress types:
  - percentage
  - numeric target + unit
- Project link modes:
  - allTasks
  - selectedTasks
- direct multiple Task links.
- multiple Habit links with equal weighting.
- per-Habit metric/target configuration.
- Habit contribution capped at 100%.
- optional target date.
- overdue behavior.
- Upcoming behavior.
- Goal reached 100% prompt: Keep active / Mark completed.
- reminders:
  - 7 days before
  - 3 days before
  - 1 day before
  - target date
  - one configurable time per Goal
- optional milestones.
- dated milestones in Calendar.
- overdue milestones in Today.
- Goal history stored in IndexedDB.

## 5. Habits

- Add/Edit/Delete/Archive/Restore.
- Area optional.
- link to multiple Goals.
- Active / Paused / Archived.
- checkbox or numeric tracking.
- frequency:
  - Daily
  - Selected weekdays
  - X times per week
  - Every N days
- historical logs editable for past/current dates; future unavailable.
- Done / Skipped / Missed semantics.
- numeric quick-add values + direct total edit.
- current streak / longest streak / total check-ins / completion rate.
- heatmap + history list.
- X-times-per-week resets next week while preserving statistics.
- extra check-ins above target allowed.
- continuation:
  - Repeat automatically
  - Ask each period
  - One period only
- end conditions:
  - Never
  - On date
  - After N successful periods
- multiple reminder times.
- reminder snooze:
  - 15 min
  - 1 hour
  - Tonight
- weekly reminders stop after target reached.

## 6. Today integration

Today may contain:

- Overdue Tasks
- Tasks
- Habits
- Overdue Milestones
- Overdue Goals
- Goals due today
- Suggestions
- Completed

X-times-per-week Habits stay visible for the whole week, including after reaching the target.

## 7. Upcoming integration

- future Tasks remain.
- future Active Goals with `targetDate` are shown in a Goals section.
- Habits are not shown.

## 8. Calendar

### Week

- seven columns.
- all-day + timed entries.
- `plannedTime` and `dueTime` supported independently.
- planned Task event + due Task event; same date merges into one visual item.
- Goal target date event.
- Habit scheduled event.
- milestone event.
- Task drag → changes plannedDate and preserves plannedTime.
- Goal drag → changes targetDate.
- Habit not draggable.

### Month

- real calendar month navigation.
- day cells show summary counts.
- click day → Day Detail.

### Day Detail

Quick actions:

- Task: Complete / Move / Open.
- Habit: check-in / numeric quick add / edit / open.
- Goal: update progress / open.
- Milestone: complete / open Goal.

### Calendar creation

From a selected day:

- New Task → selected plannedDate.
- New Goal → selected targetDate.
- New Habit → selected startDate.

### Visibility filters

- Tasks
- Habits
- Goals
- Milestones

## 9. Templates

Types:

- Task
- Project
- Habit
- Goal

Management:

- Add
- Edit
- Delete
- Duplicate
- Save as template from existing object

Rules:

- snapshot, not live link.
- relative dates.
- Project template creates Project + new Task instances.
- Habit template does not copy check-in/streak history.
- Goal template does not copy current progress/history/completed milestone state or links to existing Projects/Tasks/Habits.

## 10. Saved Views

Types:

- Tasks
- Goals
- Habits

Management:

- Add
- Edit
- Delete
- Duplicate
- Pin / Unpin

Task filters:

- Project
- Area
- Tag
- Priority
- Planned date
- Due date
- Completion state

Goal filters:

- Area
- Status
- Target date

Habit filters:

- Area
- Status

## 11. Sidebar/navigation

Groups:

- Today / Inbox / Upcoming / Calendar
- Work: Projects / Areas / Tags
- Progress: Goals / Habits
- Tools: Templates / Saved Views
- Pinned Areas
- Pinned Views
- More: Completed / Archived Projects / Settings

Groups can collapse/expand and persist state.

Archived Goals/Habits/Areas live in their own module filters/tabs, not a universal Archive screen.

## 12. Keyboard shortcuts

- preserve existing defaults.
- add V1.3 module shortcuts.
- Settings allows custom remapping.
- conflict validation required.
- Reset to defaults.
- shortcuts disabled while typing/editing.

## 13. Recurring tasks V1.3

- Pause / Resume recurrence.
- Skip next occurrence.
- End recurrence.
- End on date.
- End after N occurrences.
- Edit recurrence.
- edit scope:
  - This occurrence
  - This and future
- past/completed occurrences are not retroactively rewritten.

## 14. Universal delete safety

Every normal entity delete:

1. confirmation
2. delete
3. Snackbar Undo

Undo restores complete relevant state.

Attachments/blobs/history that are needed for Undo must not be physically destroyed until the Undo window expires.

## 15. Global destructive safety

### Reset App Data

- create/download safety ZIP.
- internal recovery snapshot.
- type `RESET`.
- execute and verify.
- rollback on failure.

### Restore / Replace All

- validate import before replacement.
- create/download safety ZIP.
- internal recovery snapshot.
- type `RESTORE`.
- replace and verify.
- rollback on failure.

### Clear Completed

- confirmation.
- delete completed tasks.
- Snackbar Undo restores full snapshots.
