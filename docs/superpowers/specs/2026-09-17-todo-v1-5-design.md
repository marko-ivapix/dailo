# Dailo V1.5 Design Specification

**Status:** Approved for implementation  
**Date:** 2026-09-17  
**Baseline:** V1.4 local-first prototype

## Goal

V1.5 makes Dailo faster for daily execution and more useful for measurable
goals, habits, time planning, knowledge capture and personal workflows.

## Product principles

- Keep Today as the primary working surface.
- Prefer direct, visible actions over configuration-heavy screens.
- Preserve the existing dark brand system, modular vanilla JavaScript structure,
  global Search behavior and the prohibition on bulk actions.
- Keep the product local-first and dependency-free.
- Preserve V1.4 records and normalize new fields safely on load.

## Scope

### 1. Tasks 2.0 and Today Focus

- Add optional task duration in minutes.
- Add a Today Focus queue with up to three selected open tasks.
- Add quick inline completion, planning and focus actions from Today.
- Extend deterministic Quick Add parsing for a trailing date/time phrase while
  keeping the existing title-first behavior.
- Add a small Daily Review surface for completed work and unfinished work.
- Keep the existing Open/Completed task lifecycle and one-level subtasks.

### 2. Goals/Habits 2.0

- Goals support current value, target value and unit when using numeric progress.
- Goals can show health (`on-track`, `at-risk`, `overdue`) derived from progress
  and target date.
- Habits support optional minimum and ideal targets plus a grace-day setting.
- Habit insights show completion against minimum/ideal, recovery after a missed
  day, and weekly/monthly summaries.
- Goal detail surfaces the contribution of linked Tasks and Habits.

### 3. Calendar time-blocking

- Timed Tasks use duration to render a lightweight block in Day/Week views.
- Dragging a Task changes its planned date/time and preserves its duration.
- Conflicting timed Tasks are visibly flagged.
- Calendar derives blocks from Tasks; it does not create a second event store.
- Month and existing all-day behavior remain intact.

### 4. Notes/Resources 2.0

- Resources support type, reading status, author, favorite and last-reviewed date.
- Notes and Resources support optional text clipping and image/file attachments.
- Existing Area, tag and relationship behavior remains compatible.
- Resource filters use existing local data and do not change global Search.

### 5. Templates and personalization

- Templates support simple variables for title/description and relative dates.
- Template creation may optionally schedule generated Tasks.
- Users can reorder/pin Today sections and enable a focused dashboard mode.
- Existing Saved Views, shortcut conflict checks and pinning remain intact.

### 6. Backup and finishing polish

- Local automatic safety snapshots retain the most recent versions.
- Users can restore one selected entity from a snapshot without replacing all data.
- Existing ZIP export/import, typed RESET/RESTORE and Undo semantics remain.
- Add reduced-motion support and consistent empty/error/loading states.
- Surface storage failures without silently resetting state.

## Storage and compatibility

- Keep compact metadata in `localStorage` and attachments/history/snapshots in
  IndexedDB.
- New V1.5 fields are optional and normalized with safe defaults.
- Do not invalidate V1.2, V1.3 or V1.4 ZIP backups.
- Do not add a framework, backend, account system, cloud sync, AI planning,
  collaboration or native mobile clients.

## Delivery order

1. Data foundation and Tasks 2.0.
2. Today Focus and Daily Review.
3. Goals/Habits 2.0.
4. Calendar time-blocking.
5. Notes/Resources 2.0.
6. Templates and personalization.
7. Backup, polish and full regression.

## Acceptance direction

V1.5 is ready when each scope area has a visible end-to-end flow, V1.4
behavior remains intact, the automated suite is green, isolated browser flows
pass, old backups still import, and the distributable ZIP is valid.
