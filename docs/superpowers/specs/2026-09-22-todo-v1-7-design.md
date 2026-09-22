# Dailo V1.7 Design Specification

**Date:** 2026-09-22  
**Status:** Draft for user review  
**Baseline:** V1.6 (`9655b4c`)

## Goal

V1.7 closes the highest-impact functional, mobile-access, accessibility, and data-safety gaps found in the V1.6 implementation. It is a stabilization release before the planned full visual redesign. V1.7 must preserve existing V1.6 behavior and must not introduce a new product direction.

## Non-negotiable constraints

- Keep the application static, local-first, framework-free, and based on HTML, CSS, and vanilla JavaScript.
- Preserve V1.6 behavior unless this specification explicitly changes it.
- Do not redesign or re-rank global Search.
- Do not add bulk-selection or bulk-action UI.
- Preserve the Dailo dark technical design system and compact-density direction; only make targeted usability fixes.
- Do not open or depend on an isolated Chromium runtime. Browser acceptance is a separate user-owned-browser check.
- Preserve confirmation → delete → Undo for normal deletion and the stronger typed Reset/Restore recovery flow.
- No cloud accounts, collaboration, server push, native clients, AI planning, or external calendar integration in V1.7.

## Release structure

1. Mobile navigation and responsive access.
2. Accessibility and interaction hardening.
3. Browser/regression coverage and release evidence.
4. Data, recurrence, multi-tab, and backup hardening.
5. Targeted final polish and documentation.

Each block is independently testable and reviewed before the next block begins.

## Block 1 — Mobile navigation and responsive access

### Behavior

- Keep the existing five primary bottom-navigation destinations: Today, Inbox, Calendar, Goals, and Habits.
- Add a mobile `More` destination that opens a modal sheet or drawer with every remaining route: Upcoming, Anytime, Projects, Areas, Tags, Notes, Resources, Cleaning, Templates, Saved Views, Completed, Archived, Search, and Settings.
- The More sheet must show the current route, close on selection, close on Escape, close on explicit close control, and return focus to its opener.
- Keep desktop sidebar navigation unchanged in meaning and ordering.
- Preserve deep-link/hash routing and browser back/forward behavior.
- Keep Quick Add separate from navigation; opening Quick Add must not hide or replace the bottom navigation.
- Make Calendar Week usable on narrow viewports by providing a deliberate responsive presentation (compact day strip, horizontal scroll with visible context, or an equivalent documented pattern).

### Acceptance

- Every existing route is reachable from a phone-width viewport without relying on Quick Add or a hidden sidebar.
- The More sheet is keyboard and touch usable, has an accessible name, and restores focus after closing.
- Selecting a route updates the URL/hash and active navigation state without a full reload.
- Desktop navigation and all existing route tests remain unchanged and green.

## Block 2 — Accessibility and interaction hardening

### Behavior

- Add accessible names to icon-only task, subtask, delete, close, and modal controls.
- Use the visible modal title as the dialog accessible name where one exists.
- Apply consistent focus management to all dialogs, popovers, filter sheets, task menus, repeat/reminder menus, and the More sheet: initial focus, containment while open, Escape close, and focus return.
- Implement semantic tabs for Areas with `role="tab"`, `aria-selected`, `aria-controls`, and keyboard arrow navigation.
- Restrict `aria-live` to concise status/toast regions rather than the full app shell.
- Keep compact controls at or above a 44px touch target when they are used as primary mobile actions.
- Preserve the rule that shortcuts are inactive while typing in editable controls.

### Acceptance

- Static/DOM tests cover accessible names, dialog labels, tab semantics, and live-region scope.
- Keyboard traversal never escapes an open dialog or popover unexpectedly.
- Focus returns to the element that opened each overlay.
- Existing completion, editing, delete/Undo, and shortcut behavior remains intact.

## Block 3 — Browser/regression coverage and release evidence

### Behavior

- Extend the standard regression runner so V1.3, V1.5, and V1.6 browser scenarios are included alongside the existing V1.1/V1.2 scenarios.
- Keep browser scenarios deterministic and independent of seed/demo data.
- Add explicit scenario coverage for reload persistence, attachments, Delete → Undo, Reset/Restore, drag-and-drop, modal focus/Escape, mobile navigation, and touch/compact layout.
- Do not claim native browser acceptance from static inspection or Node tests alone. The release ledger must distinguish automated evidence from user-owned-browser evidence.

### Acceptance

- The regression command enumerates and executes all maintained browser scenario groups.
- A failure identifies the scenario and preserves enough context to reproduce it.
- The release ledger records exact automated counts and clearly marks any manual browser checks still pending.

## Block 4 — Data, recurrence, multi-tab, and backup hardening

### Behavior

- Preserve local wall-clock time when advancing recurring reminders across daylight-saving or timezone offset changes.
- Validate Goal links in both directions. On import, either reject inconsistent reciprocal links or repair them deterministically and report the repair.
- Validate shared metadata timestamps as real ISO timestamps for Notes, Resources, and all entities that participate in date sorting/history.
- Enforce bounded total attachment count/bytes, ZIP entry count, and decompressed import size before and during backup extraction.
- Consolidate restore operations onto the recovery-backed transactional path; a failed restore must leave the prior workspace untouched.
- Enforce globally unique IDs or a documented typed-ID invariant consistently across core validation and backup validation.
- Apply a bounded automatic-snapshot policy (byte budget, metadata/delta snapshots, or equivalent) so attachments cannot silently exhaust IndexedDB quota.
- When another tab changes canonical data, show a concise stale-data notice and offer a safe reload/refresh path. Keep attachment and log synchronization consistent with canonical state.

### Acceptance

- DST regression tests prove a fixed local reminder time remains fixed.
- Imported inconsistent Goal links are never rendered with silently incorrect progress.
- Invalid timestamps and oversized/over-counted archives are rejected before destructive replacement.
- Restore rollback tests prove the original workspace remains available after injected failure.
- Snapshot retention stays within its documented budget.
- Multi-tab changes are visible to the user and do not overwrite newer canonical data silently.

## Block 5 — Targeted polish and documentation

### Behavior

- Improve only the specific responsive and density issues needed by Blocks 1–4: mobile filters, compact Notes/Resources/Areas lists, mobile Day Detail, sticky context where useful, empty states, and focus-ring visibility.
- Do not perform the full visual redesign in V1.7; that is the next phase after stabilization.
- Update `AGENTS.md`, `README.md`, `PROJECT_OVERVIEW.md`, `docs/claude/*`, and the V1.7 progress ledger with actual implementation and test evidence.
- Produce a fresh V1.7 distributable ZIP with its checksum.

### Acceptance

- No documentation claims a browser/manual result that was not actually observed.
- The full automated suite, syntax checks, static checks, and `git diff --check` pass.
- The distributable ZIP contains the intended V1.7 files and can be validated independently.

## Data and migration

- V1.7 is additive and migration-safe on top of schema V3 and existing V1.6 data.
- Validation/repair runs before derived views render.
- No migration silently deletes valid user data.
- Corrupt or incompatible data follows the existing recovery path.

## Out of scope

- Full visual redesign.
- Accounts, cloud sync, teams, comments, AI planning, server/background notifications, Google/Apple Calendar integrations, native iOS/Android, nested goals, weighted goal contributions, inline PDF/image preview, full hourly time-blocking, and bulk actions.

