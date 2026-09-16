# Static Domain Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal static domain-module seam and extract Notes/Resources so future Goal and Habit work can be isolated by file.

**Architecture:** `app.js` keeps state, persistence, global events and fallback rendering. A registry loaded before it invokes adapters with an app-created context. `knowledge.js` owns only the newly added Note/Resource renderer and actions.

**Tech Stack:** Existing HTML, CSS and classic vanilla-JS scripts.

**Spec:** `docs/superpowers/specs/2026-09-16-static-domain-modules-design.md`

## Global Constraints

- Preserve all behavior, state IDs, Search, attachment ownership, delete/Undo, backup/recovery and no-bulk policy.
- No framework, bundler, ES-module migration, persistent module state, storage access from adapters, or duplicate event listeners.
- User-selected fast-prototype mode permits only scoped diff checks and manual preview; no new large automated/review cycle.

---

### Task 1: Establish the registry seam and extract Knowledge UI

**Files:**
- Create: `js/domain-modules.js`
- Create: `js/knowledge.js`
- Modify: `index.html`
- Modify: `js/app.js`

**Interfaces:**
- Produces `window.TodoDomainModules.register(adapter)` and `getAdapters()`.
- Adapter contract: `renderRoute(route, context)`, `handleAction(action, event, context)`, `handleInput(event, context)`; return `undefined`/`false` to defer to incumbent app logic.
- `app.js` creates the ephemeral context from its existing closures; adapters never access localStorage, IndexedDB, or install DOM listeners.

- [ ] Create a small registry with duplicate-name rejection and insertion-order adapter enumeration.
- [ ] Add registry and `knowledge.js` script tags between backup and app scripts.
- [ ] Move only Note/Resource render helpers and their Note/Resource action/input branches from `app.js` into `knowledge.js`. Pass existing rendering, modal, mutation, attachment, routing and formatting helpers through the context rather than duplicating them.
- [ ] Have `render()` ask adapters before its incumbent route fallback and have the existing global handlers delegate action/input events before their fallback cases.
- [ ] Preserve generated HTML/data attributes/copy and all existing action names exactly. If the adapter is absent or declines an action, preserve the incumbent fallback.
- [ ] Inspect scoped diff, run `git diff --check`, manually create/edit one Note and Resource in the isolated preview if available, and commit scoped files.

## Self-review

- The single task implements the exact approved seam and extracts only the new Knowledge domain.
- Goal/Habit files are not created as empty shells; their extraction accompanies their approved features in the original prototype plan.
- No state, storage, recovery, Search, attachment, or delete code gains a second implementation.
