# AGENTS.md — To Do App V1.3

This file is the entry point for Codex or any coding agent working in this repository.

## Mission

Build and finish the **To Do App V1.3** as a desktop-first, dark, local-first productivity application for individuals and freelancers.

The core product workflow is:

**Capture → Organize → Plan → Complete**

The product is **Today-first**. Today is the main working surface; Projects, Areas, Goals, Habits, Calendar, Tags, Templates and Saved Views are supporting systems, not competing dashboards.

## Source of truth — read in this order

1. `AGENTS.md` — execution rules and repository conventions.
2. `docs/codex/PRODUCT_BRIEF.md` — product model and high-level behavior.
3. `docs/codex/V1_3_SCOPE.md` — required V1.3 feature set.
4. `docs/superpowers/specs/2026-09-15-todo-v1-3-design.md` — **authoritative functional/system design spec**.
5. `docs/superpowers/plans/2026-09-16-todo-v1-3.md` — **authoritative implementation plan**.
6. `docs/codex/TASKS.md` — condensed implementation checklist.
7. `docs/codex/ACCEPTANCE.md` — completion/verification checklist.

If a summary document conflicts with the full V1.3 design spec, **the design spec wins**. If implementation sequencing differs, **the implementation plan wins**.

## Technology constraints

- Static browser application.
- HTML + CSS + vanilla JavaScript.
- No framework migration unless explicitly approved.
- No backend, accounts or cloud sync in V1.3.
- Primary metadata state is local-first.
- `localStorage` stores compact application state.
- IndexedDB stores large/growing data such as attachments, Habit logs, Goal history and recovery snapshots.
- Existing V1.2 user data must migrate safely to schema V3.
- Existing Search behavior must not be redesigned in V1.3.
- No bulk-selection/bulk-action UI.

## Product rules that must not be broken

### Tasks

- A task exists once; Today/Inbox/Upcoming/Anytime/Projects/Tags/etc. are derived views.
- `plannedDate` = when the user intends to work on the task.
- `dueDate` = deadline.
- `plannedTime` and `dueTime` are independent optional values.
- Task completion status is Open/Completed only.
- Priority is metadata only; it must not auto-sort or change Suggestions.
- Subtasks are one level only.
- A task may link to multiple Goals.
- A task inside a Project inherits the Project Area; standalone tasks may have their own Area.

### Projects

- Flat Project → Tasks model.
- Project Area is optional.
- Project can link to multiple Goals.
- Lifecycle remains Active/Archived.

### Areas

- Global objects with name, color and icon.
- Optional organizational layer.
- May organize Projects, standalone Tasks, Goals and Habits.
- Deleting an Area never deletes linked objects; it removes Area references.
- Active/Archived lifecycle.
- Can be pinned to sidebar.

### Goals

- Global objects; Area is optional.
- Status: Active / Paused / Completed / Archived.
- Progress mode: Manual / Linked Tasks / Linked Habits.
- Manual progress supports percentage or numeric target.
- Linked Tasks: equal task weights; subtasks are not separate progress units.
- Linked Habits: equal Habit weights; each Habit link has its own metric/target; contribution capped at 100%.
- Goal can link to multiple Projects, Tasks and Habits.
- A Project contribution can be `allTasks` or `selectedTasks`.
- 100% progress prompts the user to Keep active or Mark completed; never silently auto-complete.
- Supports optional target date, reminders, milestones and Goal history.
- Overdue Active Goals appear in Today under a separate Overdue Goals section.
- Future Active Goals appear in Upcoming.

### Habits

- Global objects; Area is optional.
- Lifecycle: Active / Paused / Archived.
- Tracking: checkbox or numeric.
- Frequency: Daily / Selected weekdays / X times per week / Every N days.
- Check-in states: Done / Skipped / Missed.
- Numeric habits support quick-add values and direct total edit.
- Historical dates are editable; future dates are not.
- Streak semantics depend on schedule type.
- `X times per week` resets weekly progress each week; extra check-ins above target remain in statistics.
- Continuation: Repeat automatically / Ask each period / One period only.
- End condition: Never / On date / After N successful periods.
- Multiple reminder times are supported.
- For X-times-per-week, reminders stop after the weekly target is reached but the Habit remains visible in Today.
- Habit reminder snooze options: 15 min / 1 hour / Tonight.

### Calendar

- Week + Month views.
- Week = seven day columns; no hourly time-block grid.
- Tasks show planned events and due events; same-day planned+due is shown once with both metadata values.
- Goals with `targetDate` are shown.
- Scheduled Habits are shown.
- Dated Goal milestones are shown.
- Task drag changes `plannedDate`; existing `plannedTime` is preserved.
- Goal drag changes `targetDate`.
- Habit is not draggable.
- Month cells show counts/summary, not a long event list.
- Clicking a Month date opens Day Detail.
- Day Detail supports quick actions, not full inline editors.

### Templates

- Types: Task / Project / Habit / Goal.
- Add / Edit / Delete / Duplicate.
- Existing Task/Project/Habit/Goal can be saved as a template.
- Template is a snapshot, not a live link.
- Template dates are relative, not fixed calendar dates.
- Goal templates do not retain links to existing Projects/Tasks/Habits.

### Saved Views

- Types: Tasks / Goals / Habits.
- One Saved View targets one object type only.
- Can be pinned/unpinned in sidebar.
- Search remains separate and unchanged.

### Delete policy

All normal entity deletion follows:

**Confirmation → Delete → Snackbar Undo**

This applies to Task, Subtask, Project, Tag, Area, Goal, Habit, Milestone, Attachment, Template, Saved View and other deletable entities.

Undo must restore the full relevant snapshot, including links/history/attachments when applicable.

Global destructive actions such as Reset and Restore/Replace All use stronger protection:

1. Generate/download safety ZIP.
2. Create internal recovery snapshot.
3. Require typed confirmation (`RESET` or `RESTORE`).
4. Execute.
5. Verify.
6. Roll back from recovery snapshot on failure.

`Clear Completed` uses confirmation + Undo snapshot.

## UI / brand rules

The visual design source is the existing Universal Brand Design System used by the project.

Core direction:

- Dark technical foundation.
- Premium / technical / precise / high-contrast.
- Electric blue for primary action/focus.
- Mint for positive/completion state.
- Yellow for warning.
- Red for danger/overdue/destructive states.
- Restrained color usage; neutrals dominate.
- Space Grotesk for prominent headings/brand moments.
- Geist for navigation, forms, body, metadata and controls.
- Phosphor icon language.
- Avoid heavy glassmorphism, excessive glow and generic rounded SaaS styling.
- Desktop sidebar target: 240px expanded / 72px collapsed.

Do not spend time on final UX/UI polish until the V1.3 functional acceptance criteria are green. The user explicitly wants UX/UI work after feature completion.

## Coding rules

- Preserve existing behavior unless the V1.3 spec explicitly changes it.
- Prefer small focused modules over one growing monolith.
- Do not silently change storage IDs or user-facing semantics.
- Do not delete/migrate user data without validation and rollback safety.
- Never silently reset corrupted/incompatible state.
- Keep keyboard actions disabled while typing in editable controls.
- All major overlays require correct Escape/focus behavior.
- Do not change global Search ranking or scope in V1.3.

## Development workflow

For each plan task:

1. Read the relevant section of the V1.3 spec.
2. Write/update a failing test first for new behavior.
3. Run it and verify the expected failure.
4. Implement the minimal behavior.
5. Run focused tests.
6. Run relevant regression tests.
7. Only then mark the task complete in `docs/codex/TASKS.md`.

Before declaring V1.3 complete, execute the full acceptance checklist in `docs/codex/ACCEPTANCE.md` and the full regression suite.

## Important current-state note

Do **not** infer implementation completeness from prior chat messages. Inspect the actual repository/files/tests first. The checked state in `docs/codex/TASKS.md` should only be updated after fresh verification in the current working tree.
