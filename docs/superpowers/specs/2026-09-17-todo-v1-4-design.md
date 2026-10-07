# Dailo V1.4 Design Specification

**Status:** Implemented as a historical V1.4 extension; current source and `docs/superpowers/progress-v1-4.md` are the factual evidence
**Date:** 2026-09-17  
**Baseline:** V1.3 local prototype

## Goal

V1.4 turns the V1.3 feature set into a faster daily-planning workspace with stronger Today/Upcoming flow, richer Calendar planning, clearer Goal/Habit insights, and a more reliable mobile experience.

## Product principles

- Keep the Today-first workflow and make the next useful action obvious.
- Prefer small, direct interactions over configuration-heavy screens.
- Preserve the existing dark branding/design system, no-gradient language, and current module split.
- Preserve global Search behavior and do not add bulk actions.
- Keep the prototype local-first and dependency-free.
- Treat backup, migration, undo, and recovery as product behavior, not hidden implementation details.

## Scope

### 1. Today and Upcoming 2.0

Today will prioritize overdue work, today’s Tasks, scheduled Habits, due Goals, and overdue Milestones. Upcoming will show the next planned Tasks, Goals, Habits, and Milestones with consistent date grouping. Users can snooze or move an item without leaving the view.

### 2. Task workflow

Task Properties will keep the existing organization, scheduling, attachment, recurrence, and link controls while adding clearer Important/Urgent/Focus states. Quick Add remains title-first. Mobile completion remains available through the right-side control and swipe gesture.

### 3. Calendar planning

Calendar will support a stronger Day Detail, Week and Month summaries, planned/due times, time-block visibility, drag-and-drop date changes, and conflict hints. Calendar changes must update the same task/habit/goal state used by Today and Upcoming.

### 4. Goals and Habits insights

Goals will expose linked Tasks, Projects, Habits, Milestones, history, reminders, horizon, target date, and completion state in one readable detail view. Habits will support month navigation, historical check-ins, streaks, routine grouping, numeric progress, and trend summaries without allowing future check-ins.

### 5. Notes and Resources

Notes and Resources remain separate entities. Resources require a title plus at least one URL, image, or file. Both support Area, tags, descriptions/body, attachments, and relationships to Tasks, Projects, Goals, and Habits.

### 6. Mobile and accessibility

V1.4 will improve the mobile Quick Add, bottom navigation, touch targets, swipe affordances, focus restoration, Escape behavior, disabled future Habit cells, and empty/error/loading states.

### 7. Local safety and release

V1.4 will retain ZIP backup/import, safety snapshots, typed RESET/RESTORE confirmation, universal delete/Undo behavior, and V1.3 migration compatibility. The final package will include a documented migration path and a validated distributable ZIP.

## Architecture

- Keep the existing vanilla JavaScript architecture and focused modules (`js/*-ui.js`).
- Keep shared derivation and date rules in `js/core.js`.
- Keep orchestration, persistence coordination, modal routing, and recovery coordination in `js/app.js`.
- Increment the persisted schema version only when a V1.4 data shape requires it; otherwise keep V1.3-compatible fields optional and normalize them on load.
- Keep attachments in the existing attachment store and keep ZIP metadata/data validation centralized in `js/backup.js`.
- Add no framework, build step, or third-party dependency for V1.4.

## Delivery phases

1. Today/Upcoming 2.0 and Task workflow.
2. Calendar planning and cross-view consistency.
3. Goals/Habits insights.
4. Notes/Resources organization.
5. Mobile/accessibility polish.
6. Migration, safety, regression, and distributable packaging.

## Non-goals

- Cloud sync, accounts, authentication, or team collaboration.
- A redesigned global Search.
- Bulk actions.
- AI-generated tasks or recommendations.
- Native iOS/Android clients.
- A framework rewrite.

## Acceptance direction

V1.4 is ready for implementation review when every phase has a visible end-to-end flow in the isolated preview, V1.3 behavior remains intact, the Node suite is green, migration/backup checks pass, and the final ZIP opens without missing assets.
