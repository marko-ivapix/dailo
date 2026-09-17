# Dailo V1.6 Design Specification

**Date:** 2026-09-17  
**Status:** Approved in chat; awaiting written-spec review before implementation  
**Baseline:** V1.5 (`08234b0`)

## Goal

V1.6 makes Dailo faster to use every day while preserving the V1.5 local-first model, branding, entity semantics, and Search behavior. The release is delivered as six independently testable blocks, starting with Tasks 2.0 and Today focus.

## Non-negotiable constraints

- Keep the application static, local-first, and framework-free: HTML, CSS, and vanilla JavaScript.
- Preserve all V1.5 behavior unless this specification explicitly changes it.
- Do not redesign or re-rank global Search.
- Do not add bulk-selection or bulk-action UI.
- Preserve the Dailo dark technical design system, compact density direction, Space Grotesk/Geist typography, and restrained electric-blue/mint/yellow/red semantics.
- Do not open or depend on an isolated browser runtime for implementation. Browser acceptance is a separate user-owned-browser check.
- Every new destructive action keeps the existing confirmation → delete → Undo policy.
- All new state remains local-first and must survive reload and V1.5-to-V1.6 migration.

## Release structure

The blocks are intentionally sequenced so each one can ship and be reviewed independently:

1. **Tasks 2.0 + Today focus** — daily work surface and task interaction.
2. **Goals/Habits 2.0** — progress, history, and useful metrics.
3. **Calendar time-blocking** — planned work in time-aware day/week views.
4. **Notes/Resources 2.0** — richer knowledge records and linking.
5. **Templates and personalization** — repeatable setup and user preferences.
6. **Backup and final polish** — recovery confidence, responsive density, and regression cleanup.

Each block has its own tests, ledger entry, review checkpoint, and commit. A later block may consume only interfaces already completed by an earlier block.

## Block 1 — Tasks 2.0 + Today focus

### Purpose

Make Today the fastest place to capture, triage, and finish work without turning it into a second database. Today remains a derived view over the canonical Task records.

### Behavior

- Keep the current Today ordering/context rules: Today header/context stays first, then pinned content, then the existing task sections and derived sections.
- Add a compact focus strip showing the current date, open-task count, completed-task count, and a single primary capture action.
- Add lightweight view filters for `All`, `Open`, `Completed`, `Important`, and `Due today`. Filters are presentation-only and do not mutate task data.
- Preserve task identity: a task appears once in storage and all Today/Inbox/Upcoming/Project/Tag views remain projections.
- Keep `plannedDate`, `dueDate`, `plannedTime`, and `dueTime` independent. The UI may show them together, but saving one must not overwrite the other.
- Keep task properties collapsed by default. The disclosure opens and closes only from its summary click; Escape closes the modal as before.
- Keep Quick Add available on desktop and mobile. Mobile remains a floating plus control with circular options; it opens and closes on explicit toggle only.
- Support the existing completion interaction and mobile swipe affordance without changing completion semantics.
- Keep keyboard shortcuts disabled while typing in editable controls.
- Keep global Search scope/ranking unchanged.

### Presentation

- Use the existing compact density tokens and reduce repeated chrome rather than adding another dashboard.
- Make task rows readable at the compact scale: title, status, priority, due/planned metadata, and one completion control remain visible.
- Use mint only for completion, electric blue for focus/primary action, yellow for important/attention, and red for overdue/destructive state.
- Maintain desktop sidebar and mobile navigation behavior from V1.5.

### Interfaces

- `TodoCore.todayTaskProjection(tasks, filters, today)` remains the source for visible task rows.
- `TodoApp.renderToday()` consumes the projection and current focus filter without writing derived state.
- `TodoApp.openTaskModal(taskId, options)` continues to open the canonical task editor.
- Any new filter state is view state only and must not be written to task records.

### Acceptance

- A user can switch each Today filter and see only matching derived rows.
- Completing or editing a task updates the active Today filter without a full-page reload.
- A task with both planned and due values still shows both values after editing and reload.
- Task properties start closed and toggle predictably.
- Search produces the same result set and ordering as V1.5 for the same data.
- Existing task, Today, Quick Add, delete/Undo, and shortcut tests remain green.

## Block 2 — Goals/Habits 2.0

### Purpose

Turn Goals and Habits into understandable progress systems rather than configuration screens.

### Behavior

- Goals show current progress, target/remaining values, status, target date, and linked work counts.
- Keep all V1.5 progress modes and lifecycle rules: Manual, Linked Tasks, Linked Habits; Active, Paused, Completed, Archived; 100% prompts before completion.
- Add a compact progress history view with selectable week/month range and a clear empty state.
- Habits retain the monthly 1–31 tracker, historical-date editing, future-date lockout, schedule-aware math, streaks, skipped/missed states, numeric tracking, reminders, snooze, continuation, and end conditions.
- Habit percentages count only eligible scheduled units; weekly-target habits are measured against their target, not visible cell count.
- Goals and Habits may expose summary cards in Today only when already eligible under existing derived-view rules.

### Acceptance

- Progress values are mathematically consistent for daily, selected-weekday, every-N-days, and X-times-per-week habits.
- Goal progress remains correct after task/habit edits, reload, and ZIP round trip.
- Historical check-ins can be changed; future dates remain unavailable.
- 100% progress always presents the existing keep-active/mark-completed decision.

## Block 3 — Calendar time-blocking

### Purpose

Make planned work actionable at a time-of-day level without changing due semantics.

### Behavior

- Add optional time blocks for tasks with `plannedDate` and `plannedTime`, preserving `dueDate` and `dueTime` as separate metadata.
- Day and Week views show timed task blocks in chronological order plus untimed work.
- Dragging a task changes its planned date/time only; due values remain unchanged.
- Same-day planned and due information appears once with both metadata values.
- Month remains a summary/count view; clicking a date opens Day Detail.
- Goals, milestones, and scheduled habits continue to use their existing non-draggable projections.

### Acceptance

- Creating, editing, dragging, and reloading a time-blocked task preserves all four date/time fields.
- No hidden task reappears in Calendar through an alternate projection.
- Day Detail quick actions remain quick actions and do not become full inline editors.

## Block 4 — Notes/Resources 2.0

### Purpose

Make Notes and Resources useful, separate first-class records rather than task-like placeholders.

### Behavior

- Notes and Resources remain separate entity types with independent lists and detail views.
- Required fields: `name` and at least one attachment source: URL/link, image, or file.
- Recommended fields: description, source/author, tags, Area, Project, Goal, created date, updated date, and favorite/pinned flag.
- Files and images use the existing attachment store and backup pipeline; links are validated and normalized without fetching remote content.
- Deleting a Note or Resource uses confirmation and Undo and preserves unrelated linked entities.

### Acceptance

- A record cannot save without a name and one valid URL/link, image, or file.
- Attachments survive reload, export/import, delete/Undo, and recovery validation.
- Note and Resource lists never merge their entity semantics.

## Block 5 — Templates and personalization

### Purpose

Reduce repeated setup while keeping templates snapshots, not live links.

### Behavior

- Preserve Task, Project, Habit, and Goal template types and snapshot semantics.
- Add compact template actions for Save as Template, Duplicate, Edit, Delete, and instantiate.
- Relative dates are recalculated at instantiation; fixed calendar dates are not silently copied.
- Goal templates do not retain links to existing Projects, Tasks, or Habits.
- Add user preferences for compact/default density, default Today filter, week start, and visible Today sections. Preferences are local-only and reversible.
- Keep shortcut conflict detection, reset, and typing-field protection.

### Acceptance

- A template round trip preserves intended configuration but not execution identity/history.
- Relative dates are based on the instantiation date.
- Personalization changes survive reload and have a reset-to-default action.

## Block 6 — Backup and final polish

### Purpose

Finish V1.6 with safe recovery and a consistent compact experience.

### Behavior

- V1.5 ZIP export/import remains backward-compatible and includes V1.6 state plus attachments.
- Global Reset and Restore keep safety ZIP, internal recovery snapshot, typed `RESET`/`RESTORE`, verification, and rollback on failure.
- Add a clear backup status summary: last export, last import, snapshot availability, and validation result.
- Remove only verified visual inconsistencies: oversized controls, modal padding, row density, mobile spacing, focus rings, and empty states.
- Do not change data semantics while polishing CSS.

### Acceptance

- Exported V1.6 data imports into a fresh V1.6 workspace with matching entities, links, histories, attachments, and preferences.
- Invalid or failed restore leaves the original workspace untouched.
- Desktop and mobile layouts remain keyboard/focus accessible and usable at the compact density.

## Data and migration

- V1.6 uses additive fields and existing V3 storage conventions wherever possible.
- A missing V1.6 preference or optional field resolves to a documented default; no existing record is deleted because a new field is absent.
- Migration is idempotent and runs before any derived view renders.
- Corrupt or incompatible input is rejected with the existing recovery path rather than silently reset.

## Testing strategy

- Use test-first implementation for every block: failing focused test, minimal implementation, focused test pass, regression suite.
- Core math and migration behavior are covered with Node tests.
- UI contracts use the existing DOM/static tests and Python interaction tests where available.
- Run `node --test tests/*.test.js`, JavaScript syntax checks, Python AST checks, and `git diff --check` after each block.
- Native browser acceptance remains a separate manual/user-browser step; no isolated Chromium is required or launched by this work.

## Out of scope for V1.6

- Accounts, backend sync, collaboration, notifications delivered by a server, AI features, recurring bulk operations, and a global Search redesign.

