# Product Brief — To Do App V1.3 baseline

> This document is the V1.3 product baseline. The current implementation extends it through V1.6. For current source facts, read `../../CLAUDE.md` and `../claude/FEATURES.md` first.

## Product purpose

A focused personal/freelancer productivity application that combines task management, planning, goals and habits without turning into a team project-management suite or a widget-heavy dashboard.

Primary philosophy:

**Capture quickly. Decide what matters today. Complete it.**

Core workflow:

**Capture → Organize → Plan → Complete**

Today remains the center of the product even after V1.3 introduces Calendar, Goals, Habits, Areas, Templates and Saved Views.

## Primary navigation model

### Daily planning

- Today
- Inbox
- Upcoming
- Calendar

### Work / organization

- Projects
- Areas
- Tags

### Progress

- Goals
- Habits

### Power tools

- Templates
- Saved Views

### Secondary

- Completed
- Archived Projects
- Settings

The sidebar supports collapsible groups and remembers group state. Important Areas and Saved Views may be pinned.

## Existing task system

### Today

Contains distinct sections where relevant:

- Overdue Tasks
- Today Tasks
- Habits
- Overdue Milestones
- Overdue Goals
- Goals due today
- Suggestions
- Completed

### Inbox

Capture area for tasks that have not yet been organized.

### Upcoming

Contains future Tasks and future Active Goals with target dates. Habits do not appear in Upcoming because recurring Habit instances would create noise.

### Anytime

Processed active tasks with no planned date.

### Projects

Flat Project → Task organization. Projects remain optional.

### Tags

Global reusable colored tags with Add/Edit/Delete management and a Tags screen that can show tasks for one selected tag.

### Priority

`none | low | medium | high`. Metadata/indicator only; no auto-sort.

### Attachments

Real local files stored as IndexedDB Blobs, with limits defined by V1.2:

- max 10 MB per file
- max 10 attachments per task
- all file types allowed
- Open / Download / Delete
- Delete is confirmation + Undo in V1.3

## V1.3 object model

V1.3 intentionally uses separate global object types rather than one deep hierarchy:

- Task
- Project
- Area
- Goal
- Habit
- Tag
- Template
- Saved View

Objects may link to each other where useful, but they remain independently manageable.

## Areas

Area = broad life/work context, e.g.:

- Health
- Business
- Finance
- Learning
- Personal

Area contains/organizes:

- Projects
- standalone Tasks
- Goals
- Habits

Area assignment is optional everywhere.

## Goals

Goal = desired result/progress object.

Examples:

- Launch SaaS
- Run 500 km this year
- Reach €100k revenue
- Meditate 30 days in a row

Supports:

- manual %
- manual numeric target
- automatic progress from linked Tasks
- automatic progress from linked Habits
- optional target date
- reminders
- milestones
- history
- Area
- multiple linked Projects/Tasks/Habits

## Habits

Habit = recurring behavior with history and streak semantics.

Examples:

- Meditate daily
- Gym 4x/week
- Run every 2 days
- Drink 2 L water daily

Supports:

- checkbox tracking
- numeric tracking
- multiple scheduling modes
- multiple reminder times
- historical editing
- current/longest streak
- total check-ins
- completion rate
- month heatmap
- Goal links

## Calendar

Calendar is a planning surface, not a full external-calendar clone.

### Week

Seven date columns with all-day and timed items, sorted by time. No duration/time-block rectangles.

### Month

Compact summary counts per day. Click a date to open Day Detail.

Calendar can show/hide:

- Tasks
- Habits
- Goals
- Milestones

## Templates

Reusable creation snapshots:

- Task Template
- Project Template
- Habit Template
- Goal Template

Templates may be created directly or saved from existing objects.

Dates use relative offsets so templates remain reusable.

## Saved Views

Saved filtered lists for one domain at a time:

- Tasks
- Goals
- Habits

Views may be pinned to sidebar.

## Keyboard / productivity

Existing shortcuts remain and V1.3 adds customizable shortcut mappings with conflict validation and reset-to-default behavior.

## Storage

### localStorage

Compact current state:

- tasks
- projects
- tags
- areas
- goals
- habits
- templates
- savedViews
- settings
- UI state

### IndexedDB

Growing/binary/history state:

- attachments
- habitLogs
- goalHistory
- recoverySnapshots

## Deliberately outside V1.3

Do not add these while implementing V1.3 unless separately approved:

- cloud sync
- accounts/authentication
- collaboration/team workspaces
- AI planning
- external integrations
- full calendar event/time-block system
- nested/sub-goals hierarchy
- weighted Goal task/Habit contributions
- advanced Habit analytics dashboard beyond agreed stats/heatmap
- bulk selection/actions
- global Search redesign
