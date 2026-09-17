# Dailo — Claude project guide

This file is the entry point for Claude and other coding agents working in this repository.

## Read first

Read these files in order:

1. `AGENTS.md` — non-negotiable product and engineering rules.
2. `docs/claude/PROJECT_MAP.md` — repository map and module entry points.
3. `docs/claude/ARCHITECTURE.md` — runtime, rendering and state flow.
4. `docs/claude/DOMAIN_MODEL.md` — entities, links, lifecycle and invariants.
5. `docs/claude/FEATURES.md` — current V1.3–V1.6 behavior and known gaps.
6. `docs/claude/DATA_AND_RECOVERY.md` — local persistence, migration and recovery.
7. `docs/claude/TESTING_AND_RELEASE.md` — verification commands and release facts.
8. `docs/claude/WORKING_RULES.md` — safe change and review rules.

Then consult the primary project files:

- `README.md` — current user-facing V1.6 overview and run instructions.
- `PROJECT_OVERVIEW.md` — Serbian product overview and brainstorming context.
- `docs/superpowers/specs/2026-09-17-todo-v1-6-design.md` — approved V1.6 design.
- `docs/superpowers/plans/2026-09-17-todo-v1-6.md` — V1.6 implementation plan.
- `docs/superpowers/progress-v1-6.md` — release evidence and exact verification results.

## Source-of-truth rule

For implemented behavior, inspect the current source and tests first. The V1.6 design and release ledger describe the intended/current V1.6 scope. Older V1.3/V1.4/V1.5 documents are historical unless the current source and tests confirm the same behavior. If a summary conflicts with source, do not silently guess: record the discrepancy and use the current implementation plus its tests as the factual baseline.

## Project in one paragraph

Dailo is a desktop-first, dark, local-first personal productivity prototype built with static HTML, CSS and vanilla JavaScript. Its workflow is **Capture → Organize → Plan → Complete**. `localStorage` holds compact application metadata; IndexedDB holds attachments, Habit logs, Goal history and recovery snapshots. There is no backend, account system or cloud sync.

## Safe default commands

```bash
node --test tests/*.test.js
for file in js/*.js vendor/*.js tests/*.js; do node --check "$file"; done
python3 -m http.server 8080
```

Do not launch an isolated Chromium or open/modify the user's personal Chrome unless the user explicitly asks for that browser action. Native visual/browser acceptance is separate from the local automated suite.
