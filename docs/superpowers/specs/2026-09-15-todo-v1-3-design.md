# To Do App V1.3 — Functional & System Design Spec

**Status:** Approved  
**Date:** 2026-09-15  
**Base version:** V1.2  
**Product principle:** Today-first, modular productivity system without a dashboard/widget-first experience.

---

## 1. V1.3 Scope

V1.3 adds four major functional modules while preserving the existing task workflow:

1. Calendar & Planning
2. Power Tools
3. Areas & Goals
4. Habits

Existing V1.2 functionality remains in place, including Tasks, Projects, Tags, Priority, Reminders, Recurring Tasks, Attachments, Search, Anytime, Today, Inbox, Upcoming, Completed, backup/restore, and local persistence.

### Explicit constraints

- No bulk actions.
- Existing global Search behavior remains unchanged in V1.3.
- No Brite-style customizable dashboard/widget system.
- Today remains the primary daily workflow.
- Existing manual task ordering remains valid.
- Areas, Goals, Habits, Templates and Saved Views are new modular object types, not a mandatory hierarchy.
- UX/UI visual polish is deferred until after V1.3 functional completion.

---

# 2. Global Object Model

V1.3 treats these as separate global object types:

- Task
- Project
- Area
- Goal
- Habit
- Tag
- Template
- Saved View

The model is relational rather than deeply hierarchical.

## 2.1 Concept definitions

- **Area** = broad life/work domain used for organization.
- **Goal** = measurable desired outcome.
- **Project** = organized body of work.
- **Task** = concrete actionable item.
- **Habit** = recurring behavior tracked over time.

Nothing except existing Project → Task ownership is structurally required.

---

# 3. Areas

## 3.1 Data model

```js
Area {
  id,
  name,
  color,
  icon,
  status: "active" | "archived",
  isPinned,
  createdAt,
  updatedAt
}
```

## 3.2 Area behavior

Area is optional for Projects, Goals, Habits and standalone Tasks.

### Project

```js
Project.areaId = null | areaId
```

A Project may exist without an Area.

### Goal

```js
Goal.areaId = null | areaId
```

A Goal may exist without an Area.

### Habit

```js
Habit.areaId = null | areaId
```

A Habit may exist without an Area.

### Task

A standalone Task may directly belong to an Area.

```js
Task.areaId = null | areaId
```

If a Task belongs to a Project:

```text
Task.projectId exists
→ Task inherits Project.areaId
→ Task.areaId must be null
```

A Task may not override its Project's Area.

## 3.3 Area Detail

Area Detail shows:

- summary counts
- Projects
- standalone Tasks
- Goals
- Habits

Example:

```text
Business

Projects        4
Open tasks     18
Active goals    3
Active habits   2

PROJECTS
Website Redesign
Client Portal
+ New project

STANDALONE TASKS
Call accountant
Review insurance
+ New task

GOALS
Reach €100k revenue
Launch SaaS
+ New goal

HABITS
Sales outreach
Review pipeline
+ New habit
```

Creation from Area Detail preassigns the Area:

- New Project → `project.areaId = currentArea`
- New Goal → `goal.areaId = currentArea`
- New Habit → `habit.areaId = currentArea`
- New standalone Task → `task.areaId = currentArea`

If a Task later receives a Project, the direct `task.areaId` is cleared and Area comes from the Project.

## 3.4 Area lifecycle

```text
Active
Archived
```

Archiving an Area:

- hides it from active Area views/pickers
- does not archive Projects, Tasks, Goals or Habits within it
- preserves all links
- removes it from pinned sidebar Areas
- can be restored

## 3.5 Area deletion

Deleting an Area deletes only the Area object.

All linked Projects, Tasks, Goals and Habits remain and have their `areaId` cleared.

Delete always uses Confirmation + Undo.

---

# 4. Goals

## 4.1 Goal data model

```js
Goal {
  id,
  title,
  areaId: null,
  status: "active" | "paused" | "completed" | "archived",

  progressMode: "manual" | "linkedTasks" | "linkedHabits",
  progressType: "percentage" | "numeric",

  currentValue,
  targetValue,
  unit,

  targetDate: null,

  projectLinks: [],
  taskIds: [],
  habitLinks: [],

  milestones: [],

  reminders: {
    sevenDaysBefore: false,
    threeDaysBefore: false,
    oneDayBefore: false,
    onTargetDate: false,
    time: "09:00"
  },

  createdAt,
  updatedAt,
  completedAt
}
```

## 4.2 Goal progress modes

A Goal uses exactly one progress source mode:

```text
Manual
Linked Tasks
Linked Habits
```

Tasks and Habits are never combined into one automatic progress calculation.

### Manual Goal

Manual can use either:

- percentage (`0–100%`)
- numeric target (`320 / 500 km`)

### Linked Tasks Goal

Every counted Task has equal weight.

Subtasks do not count separately.

Example:

```text
2 completed / 4 linked tasks = 50%
```

### Linked Habits Goal

A Goal may be linked to multiple Habits.

Each linked Habit contributes equally to total Goal progress.

Each Habit link has its own metric and target:

```js
{
  habitId,
  metric: "totalCheckins" | "streak" | "successfulPeriods",
  target
}
```

Each Habit contribution is capped at 100%:

```text
contribution = min(actual / target, 1)
```

Goal progress is the average of all linked Habit contribution percentages.

## 4.3 Goal ↔ Project relationship

A Project may be linked to multiple Goals.
A Goal may be linked to multiple Projects.

Each Goal ↔ Project link stores:

```js
{
  projectId,
  contributionMode: "allTasks" | "selectedTasks",
  selectedTaskIds: []
}
```

### Count all tasks

All current and future Tasks in the Project count toward Goal progress.

Adding new Tasks can reduce the completion percentage because the Goal scope expanded.

### Selected tasks

Only explicitly selected Tasks contribute.

## 4.4 Direct Goal ↔ Task relationship

A Task can belong to multiple Goals:

```js
Task.goalIds = []
```

Direct Goal ↔ Task links remain even if the Task later moves to another Project.

## 4.5 Goal ↔ Habit relationship

A Goal may be linked to multiple Habits.

All Habits have equal weight in the Goal total, while each Habit can use a different metric and target.

## 4.6 Goal lifecycle

```text
Active
Paused
Completed
Archived
```

### Active
Normal progress tracking and date behavior.

### Paused
- remains visible in Goals
- does not count as overdue
- does not appear in active Today/Upcoming overdue logic
- keeps `targetDate`

When resumed, target date is re-evaluated and may immediately become overdue.

### Completed
Preserves full Goal state, links and history.

### Archived
Removed from active Goal lists but preserved and restorable.

## 4.7 Goal completion at 100%

Reaching 100% never silently completes a Goal.

Prompt:

```text
Goal reached

[ Keep active ] [ Mark completed ]
```

## 4.8 Goal overdue behavior

An Active Goal is overdue when:

```text
targetDate < today
AND status = active
```

It appears in Today under a dedicated **Overdue Goals** section.

Paused Goals are not overdue.

## 4.9 Goal in Upcoming

Active Goals with future `targetDate` appear in Upcoming in a separate Goals grouping.

Paused, Completed and Archived Goals do not appear in active Upcoming.

## 4.10 Goal reminders

Available reminder points:

- 7 days before
- 3 days before
- 1 day before
- on target date

A Goal has one reminder time shared by all enabled points.

Default:

```text
09:00 local time
```

After target date passes, no further Goal reminder notifications are sent.

## 4.11 Milestones

Goal may contain optional Milestones:

```js
Milestone {
  id,
  title,
  date: null,
  isCompleted: false,
  completedAt: null,
  order
}
```

Milestones:

- are children of Goal
- are not Tasks
- do not automatically affect Goal progress
- may have optional dates
- appear in Calendar when dated

A dated, incomplete Milestone with a past date becomes an **Overdue Milestone** and appears in Today in a dedicated section.

Deleting a Milestone uses Confirmation + Undo.

## 4.12 Goal history

Stored as significant events only, not every low-level edit.

Examples:

- Goal created
- progress changed
- status changed
- target date changed
- Project linked/unlinked

Goal history is stored in IndexedDB.

---

# 5. Habits

## 5.1 Habit data model

```js
Habit {
  id,
  name,
  areaId: null,
  goalIds: [],

  status: "active" | "paused" | "archived",

  trackingType: "checkbox" | "numeric",
  targetValue: null,
  unit: null,
  quickValues: [],

  frequencyType: "daily" | "weekdays" | "timesPerWeek" | "everyNDays",
  weekdays: [],
  timesPerWeek: null,
  everyNDays: null,

  startDate,

  continuation: "automatic" | "askEachPeriod" | "onePeriod",

  endType: "never" | "date" | "successfulPeriods",
  endDate: null,
  successfulPeriodsTarget: null,

  reminders: [],

  createdAt,
  updatedAt
}
```

## 5.2 Habit frequency

Supported frequency types:

- Daily
- Selected weekdays
- X times per week
- Every N days

No advanced monthly/ordinal scheduling in V1.3.

## 5.3 Habit tracking types

### Checkbox

Binary behavior with daily states:

```text
Done
Skipped
Missed
```

### Numeric

Example:

```text
Drink water
1.5 / 2 L
```

Fields:

- `targetValue`
- `unit`
- `quickValues[]`

User can:

- quick-add values (`+0.25`, `+0.5`, etc.)
- manually edit total daily value

When `value >= targetValue`, the day counts as Done.

## 5.4 Habit logs

Stored in IndexedDB:

```js
HabitLog {
  id,
  habitId,
  date,
  status: "done" | "skipped" | "missed",
  value: null,
  createdAt,
  updatedAt
}
```

Past dates and Today are editable.
Future dates are not editable.

Any historical edit recalculates:

- current streak
- longest streak
- total check-ins
- completion rate
- linked Goal progress

## 5.5 Streak semantics

Streak follows the natural unit of the Habit schedule:

- Daily → consecutive successful days
- Selected weekdays → consecutive successful scheduled occurrences
- X times per week → consecutive successful weeks
- Every N days → consecutive successful scheduled occurrences

Skipped does not break streak.
Paused periods do not break streak.
Missed breaks streak when the occurrence/period was required.

## 5.6 X times per week

Example:

```text
Gym
4 times/week
```

Weekly target is considered complete as soon as target is reached.

Extra check-ins remain valid:

```text
5 / 4
6 / 4
```

Extra check-ins:

- count in statistics
- count in total check-ins
- may affect Goal metrics based on total check-ins
- do not make streak worth more than one successful week

At the next week boundary, progress resets to `0 / target` while prior week history remains.

## 5.7 Continuation behavior

Available options:

```text
Repeat automatically
Ask each period
One period only
```

### Repeat automatically
Default. New period begins automatically.

### Ask each period
At period boundary, app asks whether to:

- Continue
- Pause
- Archive

### One period only
After the period is complete, user can:

- Archive
- Convert to repeating Habit

## 5.8 Habit end conditions

All Habit frequency types support:

```text
Never
On date
After N successful periods
```

Meaning of successful period:

- Daily → successful day
- Selected weekdays → successful scheduled occurrence
- X times per week → successful week
- Every N days → successful scheduled occurrence

When an end condition is met:

```text
Habit finished
[ Archive ] [ Continue habit ]
```

## 5.9 Habit lifecycle

```text
Active
Paused
Archived
```

Paused:

- no expected check-ins are generated
- does not break streak
- reminders do not run

Archived:

- removed from active lists
- full history preserved
- can be restored to Active

## 5.10 Habit reminders

Habit can have multiple reminder times:

```js
{
  id,
  time,
  enabled
}
```

For `X times per week`:

- reminders run while weekly target is not yet complete
- once target is reached, reminders stop for the rest of the week
- Habit remains visible in Today and extra check-ins are still allowed
- reminders reactivate at the next week boundary

### Habit snooze

Supported snooze options:

- 15 min
- 1 hour
- Tonight

`Tonight` means 19:00 local time; if 19:00 has already passed, it means 21:00 same day.

## 5.11 Habit history UI behavior

Habit Detail includes:

- Current streak
- Longest streak
- Total check-ins
- Completion rate
- Monthly heatmap
- Editable history list

Heatmap is visual only; precise edits happen in History list.

Numeric heatmap intensity is capped visually at 100% of daily target.

## 5.12 Habit deletion

Delete Habit uses Confirmation + Undo.

Deleting Habit removes:

- Habit
- check-in logs
- streak/history-derived state
- reminders
- Goal links

Goals remain.

Undo must restore the complete snapshot.

---

# 6. Today V1.3

Today remains the core screen.

Sections may include:

```text
OVERDUE TASKS
TASKS
HABITS
OVERDUE MILESTONES
OVERDUE GOALS
GOALS
COMPLETED
```

## 6.1 Habits in Today

- Daily → every active day
- Selected weekdays → scheduled weekdays only
- Every N days → scheduled day only
- X times per week → visible every day of the week, even after target is reached

This allows extra check-ins after weekly completion.

## 6.2 Goals in Today

A Goal appears in Today when:

```text
targetDate = today
AND status = active
```

Overdue Active Goals appear in separate Overdue Goals.

## 6.3 Milestones in Today

Overdue incomplete Milestones appear in a dedicated Overdue Milestones section.

---

# 7. Upcoming V1.3

Upcoming contains:

- Tasks
- Active Goals with future targetDate

Habits do not appear in Upcoming.

This avoids repetitive Habit noise.

---

# 8. Calendar & Planning

## 8.1 Calendar views

V1.3 supports:

- Week
- Month

No Day main view.

## 8.2 Week view

Week view uses 7 day columns.

Each day has:

- All-day section
- Timed items sorted by time

No hourly time-block grid.

### Task planning times

Task gains:

```js
plannedTime: null
dueTime: null
```

`plannedTime` and `dueTime` are independent.

### Drag behavior

Task drag to another date:

- updates `plannedDate`
- preserves `plannedTime` when present
- all-day Task remains all-day if no plannedTime

Goal drag to another date:

- updates `targetDate`

Habit:

- not draggable
- schedule changes only through Habit settings

## 8.3 Calendar task representation

Calendar displays both `plannedDate` and `dueDate` as meaningful events.

If they fall on different dates, the same Task can appear on both dates:

```text
Sep 15 → Planned
Sep 18 → Due
```

Both open the same Task object.

If `plannedDate == dueDate`, Task appears only once with both metadata values.

## 8.4 Calendar Goals, Habits and Milestones

Calendar can display:

- Tasks
- Habits
- Goals with targetDate
- dated Milestones

Visibility toggles:

```text
Show
✓ Tasks
✓ Habits
✓ Goals
✓ Milestones
```

## 8.5 Month view

Month cells show summary only, not individual items.

Example:

```text
15
3 tasks · 2 habits · 1 goal
```

Clicking date opens Day Detail.

## 8.6 Day Detail

Day Detail shows all items for that date and supports quick actions.

### Tasks

- Complete
- Move
- Open

### Habits

- Check in
- Quick-add numeric value
- Edit value
- Open

### Goals

- Update progress
- Open

### Milestones

- Complete
- Open Goal

Day Detail is not a full inline editor.

## 8.7 Calendar creation

From a selected Calendar date, user can create:

```text
Task
Goal
Habit
```

Task:

```text
plannedDate = selectedDate
```

Goal:

```text
targetDate = selectedDate
```

Habit:

```text
startDate = selectedDate
```

---

# 9. Templates

## 9.1 Supported template types

```text
Task
Project
Habit
Goal
```

## 9.2 Template management

Templates support:

- Add
- Edit
- Delete
- Duplicate
- Save as template from an existing Task/Project/Habit/Goal

Saving as template creates a snapshot; future edits to source object do not mutate template.

## 9.3 Task Template

May save:

- title
- notes
- Project
- Area
- Goal links
- Tags
- Priority
- Subtasks
- Reminder
- Recurrence
- relative planned/due dates

## 9.4 Project Template

May save:

- name
- Area
- Goal links
- color
- predefined Tasks

Creating from template creates a new Project and new Task instances.

## 9.5 Habit Template

May save:

- name
- Area
- Goal links
- tracking type
- target value/unit
- quick values
- frequency
- reminders
- continuation
- end condition

No history/streak is copied.

## 9.6 Goal Template

May save:

- title
- Area
- progress mode/type
- target value/unit
- relative target date
- Milestones with relative dates
- reminders

Goal Template does not save concrete existing links to Projects, Tasks or Habits.

It also does not copy:

- current progress
- Goal history
- completed milestone state

## 9.7 Relative dates

Templates never store fixed reusable dates.

Examples:

```text
Today
+3 days
+20 days
+60 days
1 day before
```

Offsets are calculated from template instantiation time.

## 9.8 Template deletion

Always Confirmation + Undo.

Deleting a Template never affects objects previously created from it.

---

# 10. Saved Views

## 10.1 Saved View model

```js
SavedView {
  id,
  name,
  type: "tasks" | "goals" | "habits",
  filters: {},
  isPinned,
  createdAt,
  updatedAt
}
```

A Saved View can target exactly one object type.

It never mixes Tasks + Goals + Habits in one result list.

## 10.2 Task view filters

May include:

- Project
- Area
- Tag
- Priority
- Planned date
- Due date
- Completion state

## 10.3 Goal view filters

May include:

- Area
- Status
- Target date
- progress-related criteria where supported

## 10.4 Habit view filters

May include:

- Area
- Status
- schedule/tracking metadata where supported

## 10.5 Saved View management

Supports:

- Add
- Edit
- Delete
- Duplicate
- Pin / Unpin

`Pin to sidebar` is available during creation and can be changed later.

Delete always uses Confirmation + Undo.

---

# 11. Keyboard Shortcuts

V1.3 keeps good defaults and adds custom remapping in Settings.

Example defaults:

```text
New task              N
Search                Ctrl/Cmd + F
Today                 T
Inbox                 I
Upcoming              U
Calendar              C
Goals                 G
Habits                 H
Templates              Shift + T
```

Rules:

- shortcut can be changed
- shortcut can be disabled
- duplicate shortcut assignment is not allowed
- shortcuts never trigger while typing in input/textarea/editor/contenteditable
- Settings provides Reset to defaults

---

# 12. Recurring Task Workflow Improvements

V1.3 extends existing recurring Tasks with:

- Pause recurrence
- Resume recurrence
- Skip next occurrence
- End recurrence
- End on date
- End after N occurrences
- Edit recurrence

Editing an occurrence prompts scope:

```text
This occurrence
This and future
```

Past/completed occurrences are not retroactively rewritten.

---

# 13. Navigation / Sidebar

Primary organization:

```text
Today
Inbox
Upcoming
Calendar

WORK
Projects
Areas
Tags

PROGRESS
Goals
Habits

TOOLS
Templates
Saved Views

PINNED AREAS
[optional user-pinned Areas]

PINNED VIEWS
[optional user-pinned Saved Views]

MORE
Completed
Archived Projects
Settings
```

Sidebar sections can collapse/expand and state persists.

Individual Areas may be pinned/unpinned.
Saved Views may be pinned/unpinned.

Each module manages its own archived content:

```text
Projects → Active / Archived
Goals → All / Active / Paused / Completed / Archived
Habits → All / Active / Paused / Archived
Areas → All / Active / Archived
```

There is no single global Archive screen for all object types.

---

# 14. Goal Creation & Detail UX Behavior

## 14.1 New Goal

Basic fields:

- Title
- Area
- Progress mode/type
- Target value/unit when relevant
- Target date

Advanced fields under `More`:

- Milestones
- Reminders
- Linked Projects
- Linked Tasks / Habits depending on progress mode

## 14.2 Goal Detail editing

Simple properties use inline edit/pickers:

- title
- Area
- target value
- unit
- target date

Complex properties use dedicated panels:

- progress source
- Project/Task/Habit links
- Milestones
- reminders

Status uses quick status menu.

---

# 15. Habit Creation & Detail UX Behavior

## 15.1 New Habit

Basic:

- name
- Area
- tracking type
- frequency
- target

Advanced under `More`:

- start date
- continuation behavior
- end condition
- reminders
- linked Goals
- quick numeric values

## 15.2 Habit Detail editing

Inline/picker:

- name
- Area
- tracking type
- target value/unit
- quick values

Dedicated panels:

- frequency
- reminders
- continuation
- end condition
- linked Goals
- history edit

---

# 16. Delete Policy — Global Rule

V1.3 replaces prior mixed deletion behavior with one global principle:

> Nothing is deleted without confirmation, and every entity delete is undoable.

Applies to:

- Task
- Subtask
- Project
- Tag
- Area
- Goal
- Habit
- Milestone
- Attachment
- Template
- Saved View
- standalone reminder records where applicable

Flow:

```text
Delete action
→ Confirmation
→ Delete
→ Snackbar: "[Object] deleted · Undo"
→ Undo window
```

Undo must restore the complete relevant snapshot, including links, child data, ordering, files/history where required.

## 16.1 Attachment delete

Blob is not physically removed from IndexedDB until Undo window expires.

## 16.2 Project delete

Existing behavior remains that deleting a Project with Tasks deletes the Project and its Tasks.

Confirmation must clearly state scope.
Undo restores the complete Project + Task subtree and related metadata/files.

## 16.3 Tag delete

Tasks remain.
Tag ID is removed from Tasks.
Undo restores tag and assignments.

## 16.4 Area delete

Linked objects remain.
Area assignment is removed.
Undo restores Area and assignments.

## 16.5 Goal delete

Projects, Tasks and Habits remain.
Goal links are removed.
Milestones and Goal history are deleted with the Goal.
Undo restores all of it.

## 16.6 Habit delete

Habit logs/history/reminders are deleted with Habit.
Goals remain.
Undo restores Habit and all related data.

---

# 17. Destructive Global Actions

## 17.1 Reset App Data

Before Reset:

1. Generate safety ZIP
2. Download ZIP to user
3. Create internal temporary recovery snapshot
4. Require typed confirmation: `RESET`
5. Execute reset
6. Verify new state
7. On success, remove temporary recovery snapshot
8. On failure, automatically rollback from recovery snapshot

## 17.2 Restore / Replace All

Before Replace All:

1. Generate safety ZIP of current app
2. Download ZIP to user
3. Create internal recovery snapshot
4. Validate restore package
5. Require typed confirmation: `RESTORE`
6. Execute replacement
7. Verify restored state
8. On failure, rollback automatically
9. On success, remove temporary recovery snapshot

## 17.3 Clear Completed

Clear Completed uses:

```text
Confirmation
→ delete completed Tasks
→ Undo snapshot
```

No typed phrase is required.

Attachments are physically retained until Undo window expires.

---

# 18. Storage Architecture V3

V1.3 keeps hybrid storage.

## 18.1 localStorage

`todoAppData`, schema version `3`, stores current lightweight application state:

```text
tasks[]
projects[]
tags[]
areas[]
goals[]
habits[]
templates[]
savedViews[]
settings{}
ui{}
```

## 18.2 IndexedDB

Database stores growing/binary/long-term data:

```text
attachments
habitLogs
goalHistory
recoverySnapshots
```

This avoids making every localStorage save rewrite years of Habit history.

---

# 19. Task V1.3 Schema Additions

```js
Task {
  ...existingV12Fields,
  areaId: null,
  goalIds: [],
  plannedDate: null,
  plannedTime: null,
  dueDate: null,
  dueTime: null
}
```

Existing Task properties remain unchanged unless explicitly extended here.

---

# 20. Project V1.3 Schema Additions

```js
Project {
  ...existingV12Fields,
  areaId: null,
  goalIds: [],
  isArchived: false
}
```

Project lifecycle remains Active / Archived only.

---

# 21. Goal History IndexedDB Model

```js
GoalHistoryEvent {
  id,
  goalId,
  type: "created" |
        "progressChanged" |
        "statusChanged" |
        "targetDateChanged" |
        "projectLinked" |
        "projectUnlinked",
  data: {},
  createdAt
}
```

This is intentionally not a complete low-level audit log.

---

# 22. Recovery Snapshot Model

```js
RecoverySnapshot {
  id,
  createdAt,
  reason,
  appData,
  attachmentRefs,
  habitLogRefs,
  goalHistoryRefs
}
```

Recovery snapshots are temporary transactional safety data, not permanent user backups.

---

# 23. V1.2 → V1.3 Migration

Migration must be non-destructive.

Process:

```text
Detect schema v2
→ validate V1.2 state
→ create migration safety snapshot
→ add V1.3 default fields/collections
→ upgrade IndexedDB stores
→ validate migrated state
→ persist schema version = 3
```

## 23.1 Existing Task defaults

```js
areaId: null
goalIds: []
plannedTime: null
dueTime: null
```

## 23.2 Existing Project defaults

```js
areaId: null
goalIds: []
```

## 23.3 New collections

```js
areas: []
goals: []
habits: []
templates: []
savedViews: []
```

## 23.4 Existing V1.2 data preservation

Preserve without reinterpretation:

- Task IDs
- Project IDs
- Tag IDs
- Attachment IDs and blobs
- reminders
- recurrence
- priority
- Notes
- Subtasks
- plannedDate
- dueDate
- ordering
- archived Projects
- V1.2 settings unless directly extended

If migration fails:

- V1.2 state remains untouched
- no silent reset
- show migration error state
- allow Retry

---

# 24. V1.3 Acceptance Summary

V1.3 is functionally complete when all of the following are true:

1. Areas can be created, edited, archived, restored, pinned and deleted safely.
2. Standalone Tasks can use Areas; Project Tasks inherit Project Area.
3. Goals support manual %, numeric, linked Tasks and linked Habits progress.
4. Goals support multiple Project, Task and Habit links according to the defined rules.
5. Goal automatic Task progress treats parent Tasks equally and ignores Subtask count.
6. Habit-based Goal contributions are equal-weight and individually capped at 100%.
7. Goal status lifecycle works: Active, Paused, Completed, Archived.
8. Goal 100% completion asks user whether to complete.
9. Goal target dates support Today, Upcoming, Overdue, Calendar and reminders.
10. Goal Milestones support date, completion, Calendar and Overdue behavior.
11. Habit frequency supports Daily, Selected weekdays, X/week, Every N days.
12. Habits support checkbox and numeric tracking.
13. Historic Habit editing recalculates streak/statistics/Goal progress.
14. X/week Habits reset by week, allow over-target check-ins and use week streaks.
15. Habit continuation and end conditions work as defined.
16. Habit reminders support multiple times and snooze.
17. Today integrates Tasks, Habits, Goals and overdue Milestones/Goals in separate sections.
18. Upcoming integrates Tasks and future Active Goals, but not Habits.
19. Calendar supports Week and Month.
20. Week Calendar supports all-day/timed Task planning, Goal dates, Habits and Milestones.
21. Calendar distinguishes plannedDate from dueDate without duplicating same-day Task entries.
22. Month view shows daily summaries and opens Day Detail.
23. Day Detail supports quick actions without becoming a full editor.
24. Calendar can create Task, Goal and Habit from selected date.
25. Templates support Task, Project, Habit and Goal.
26. Templates support Add/Edit/Delete/Duplicate and Save as template.
27. Template dates are relative.
28. Goal Template excludes live Project/Task/Habit links and history.
29. Saved Views support Tasks, Goals or Habits, one type per view.
30. Saved Views support Add/Edit/Delete/Duplicate and Pin/Unpin.
31. Keyboard shortcuts have defaults and custom remapping.
32. Recurring Tasks support pause/resume/skip/end and occurrence scope editing.
33. Sidebar grouping/collapse state persists.
34. Areas and Saved Views can be individually pinned.
35. All entity deletes require confirmation and support Undo.
36. Reset and Restore/Replace All create safety ZIP + internal recovery snapshot and require typed confirmation.
37. Clear Completed uses confirmation + Undo.
38. Habit logs and Goal history are stored in IndexedDB.
39. Existing V1.2 attachments remain intact.
40. V1.2 → V1.3 migration is safe and non-destructive.
41. Existing Search remains behaviorally unchanged.
42. No bulk actions are introduced.

---

# 25. Deferred Beyond V1.3

Not part of this spec unless separately approved later:

- full time-blocking calendar with event duration
- custom Calendar type filters beyond Tasks/Habits/Goals/Milestones toggles
- mixed-type Saved Views
- Habit advanced monthly recurrence rules
- weighted Goal Habit contributions
- weighted Goal Task contributions
- nested Goals/Subgoals
- milestone-driven automatic Goal progress
- customizable dashboard/widgets
- cloud sync/accounts/collaboration
- advanced global Search changes
- bulk editing/actions
- AI planning
- deeper analytics dashboards

---

# 26. Design Intent

V1.3 expands the product substantially while keeping a simple mental model:

```text
Today = what matters now
Calendar = when things happen
Projects = organized work
Areas = broad context
Goals = desired outcomes
Habits = repeated behavior
Templates = reusable setups
Saved Views = reusable filters
```

The product should remain operationally focused rather than becoming a general-purpose dashboard workspace.

