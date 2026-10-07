# Operational UI Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing V1.3 static app faster to scan and more polished while preserving every local-first behavior and the current technical dark brand.

**Architecture:** Keep all data, routing, mutations and event ownership unchanged. Use the existing domain adapters for domain-specific markup and `css/styles.css` for the shared visual language. `app.js` only gains derived, display-only Today context where an adapter cannot own it.

**Tech Stack:** Existing vanilla JavaScript, static HTML, CSS custom properties and Phosphor icons.

**Spec:** `docs/superpowers/specs/2026-09-16-operational-ui-upgrade-design.md`

## Global Constraints

- Preserve global Search behavior, task derivation/order, state shape, IndexedDB ownership, backup/recovery, confirmation → delete → Undo and no-bulk policy.
- Reuse the dark technical BDS: Space Grotesk, Geist, electric blue primary actions, mint completion, yellow warning and red danger.
- No framework, dependency, new persistent field, new global shortcut, new store or global listener.
- Keep keyboard focus/Escape, reduced motion and existing `data-action`/route contracts intact.
- User-selected fast-prototype verification applies: inspect scoped source, run `node --check` and `git diff --check`; defer browser/automated suites until the explicit verification pass.

---

### Task 1: Shared operating-shell visual language

**Files:**
- Modify: `css/styles.css`

**Interfaces:**
- Consumes existing `--primary`, semantic colors, geometry and `.sidebar`, `.page-header`, `.section`, `.task-row`, `.goal-row`, `.habit-row`, `.modal` classes.
- Produces stronger hierarchy without changing markup or behavior.

- [ ] Add no new component runtime or visual asset.
- [ ] Tighten surface contrast, sidebar active/inactive states, page-header rhythm, section dividers, list hover/focus states and modal field/action hierarchy through existing selectors and tokens.
- [ ] Keep button/control sizing, focus ring, semantic colors and reduced-motion behavior; do not use gradients, glass, decorative glow, new card scaffolds or non-semantic animation.
- [ ] Check `css/styles.css` for responsive selectors so the existing mobile breakpoint retains readable spacing and action wrapping.
- [ ] Run `git diff --check`, inspect only the stylesheet diff, and commit with `style: refine operating shell hierarchy`.

### Task 2: Today command center hierarchy

**Files:**
- Modify: `js/app.js` (`renderToday` only)
- Modify: `css/styles.css`

**Interfaces:**
- Consumes `Core.deriveTodayV3(state, ...)`, existing `taskRow`, `renderHabitRow`, `renderGoalRow`, existing task/habit/goal actions and current UI state.
- Produces display-only Today context and semantic classes; no state mutation beyond existing controls.

- [ ] Add a Today-only header context built from the existing derived section counts; it may show a date label and concise count copy, but must not create a metric dashboard or alter section membership/order.
- [ ] Add stable semantic classes/data attributes to existing Today sections for task, habit, goal and overdue presentation. Reuse their current rows and action identifiers exactly.
- [ ] Style the Today context and sections so overdue work is clearly urgent, habits are recognizably routine work, and Goals retain progress cues while completed work stays visually quiet.
- [ ] Preserve the existing no-item empty state, Completed collapse, quick-add behavior, row drag behavior and all Today-derived view semantics.
- [ ] Run `node --check js/app.js` and `git diff --check`, inspect the scoped diff, and commit with `feat: refine today command center`.

### Task 3: Goals, Habits and Calendar scanability

**Files:**
- Modify: `js/goals-ui.js`
- Modify: `js/habits-ui.js`
- Modify: `js/calendar-ui.js`
- Modify: `css/styles.css`

**Interfaces:**
- Consumes existing Goal/Habit/Calendar adapter context and existing derived status/progress fields.
- Produces display-only labels, structural classes and CSS refinements; all actions call the existing callbacks.

- [ ] Improve Goal row/detail emphasis for status, target-date urgency, progress and History access without changing progress computation, lifecycle, reminders, links or persistence.
- [ ] Improve Habit routine/check-in/progress readability and Calendar Day Detail scannability without changing schedules, metric writes, drag behavior or reminder rules.
- [ ] Use only existing route/action/modal contracts; do not add a dashboard, new controls with new behavior, or direct storage access from adapters.
- [ ] Run `node --check js/goals-ui.js js/habits-ui.js js/calendar-ui.js` and `git diff --check`, inspect the scoped diff, and commit with `style: improve planning surface hierarchy`.

### Task 4: Notes and Resources readability

**Files:**
- Modify: `js/knowledge.js`
- Modify: `css/styles.css`

**Interfaces:**
- Consumes existing Knowledge adapter routes, `attachmentOwner`, shared attachment renderer and app callbacks.
- Produces display-only list/detail structure and existing-action affordances.

- [ ] Make Note and Resource list/detail views easier to scan: title, Area context, linked URLs/files and related entities must be clearly ordered.
- [ ] Improve empty and async attachment feedback using existing message/state surfaces; do not create rich text, preview media, a new attachment API or direct storage access.
- [ ] Preserve existing link/file actions, Area filtering, delete/Undo and resource relation cleanup.
- [ ] Run `node --check js/knowledge.js` and `git diff --check`, inspect the scoped diff, and commit with `style: improve knowledge surfaces`.

## Self-review

- Spec coverage: Tasks 1–4 map directly to the four delivery groups in the approved design.
- Safety coverage: every task is display-only or uses existing actions; no task changes data semantics, Search, delete/Undo, storage or recovery.
- Verification: source/syntax/diff checks follow the user-approved fast-prototype mode; browser and automated suites remain intentionally deferred.
