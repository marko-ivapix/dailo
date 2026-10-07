# Dailo — Claude project guide

> Documentation synchronized on 2026-10-07 against the V1.7 source, tests and release artifact, then updated for the V1.8 Quiet Graphite visual redesign implemented on the same date. V1.8 is presentation-only: behavior, persistence, Search and recovery are the V1.7 baseline. It is committed on `feature/todo-v1-3` (`4cfab6c`) and pushed to `https://github.com/marko-ivapix/dailo`; it is not packaged, and native-browser visual acceptance is manual-pending.

This file is the entry point for Claude and other coding agents working in this repository.

## Communicating with the user

Always reply to the user **in Serbian and briefly**: say what it is or what was done, and how it was done. No long reports or exhaustive lists unless the user asks. Code, file names, commands and repository documentation keep their existing language (repository docs are English; `PROJECT_OVERVIEW.md` is Serbian).

The current work branch is `feature/todo-v1-3` (the GitHub default branch `main` is older and does not contain V1.8).

## Read first

Read these files in order:

1. `AGENTS.md` — non-negotiable product and engineering rules.
2. `docs/claude/CONTINUATION.md` — current handoff, verified baseline and next-work protocol.
3. `docs/claude/PROJECT_MAP.md` — repository map and module entry points.
4. `docs/claude/ARCHITECTURE.md` — runtime, rendering and state flow.
5. `docs/claude/DOMAIN_MODEL.md` — entities, links, lifecycle and invariants.
6. `docs/claude/FEATURES.md` — current V1.3–V1.7 behavior and known gaps.
7. `docs/claude/DATA_AND_RECOVERY.md` — local persistence, migration and recovery.
8. `docs/claude/TESTING_AND_RELEASE.md` — verification commands and release facts.
9. `docs/claude/WORKING_RULES.md` — safe change and review rules.

Then consult the primary project files:

- `README.md` — current user-facing V1.7 overview and run instructions.
- `PROJECT_OVERVIEW.md` — Serbian product overview and brainstorming context.
- `docs/superpowers/specs/2026-09-22-todo-v1-7-design.md` — approved V1.7 stabilization design.
- `docs/superpowers/plans/2026-09-22-todo-v1-7.md` — V1.7 implementation plan.
- `docs/superpowers/progress-v1-7.md` — release evidence and exact verification results.
- `docs/superpowers/specs/2026-10-07-todo-v1-8-design.md` — V1.8 Quiet Graphite / Swiss Compact visual design (tokens, responsive rules, preserved behaviors).
- `docs/superpowers/plans/2026-10-07-todo-v1-8.md` and `docs/superpowers/progress-v1-8.md` — V1.8 plan and per-phase evidence.

The historical V1.3/V1.4/V1.5/V1.6 specifications and progress ledgers remain useful for intent and regression context. They are not a replacement for current source inspection.

## Source-of-truth rule

For implemented behavior, inspect the current source and tests first. The V1.7 design and release ledger describe the intended/current V1.7 scope. Older V1.3–V1.6 documents are historical unless the current source and tests confirm the same behavior. If a summary conflicts with source, do not silently guess: record the discrepancy and use the current implementation plus its tests as the factual baseline.

## Project in one paragraph

Dailo is a desktop-first, dark, local-first personal productivity prototype built with static HTML, CSS and vanilla JavaScript. Its workflow is **Capture → Organize → Plan → Complete**. `localStorage` holds compact application metadata; IndexedDB holds attachments, Habit logs, Goal history and recovery snapshots. There is no backend, account system or cloud sync.

## Safe default commands

```bash
node --test tests/*.test.js
for file in js/*.js vendor/*.js tests/*.js; do node --check "$file"; done
python3 -m http.server 8080
```

Do not launch an isolated Chromium or open/modify the user's personal Chrome unless the user explicitly asks for that browser action. Native visual/browser acceptance is separate from the local automated suite.

## Cloud sessions (Claude app / claude.ai/code)

- `.venv/` is gitignored, so it does not exist in a cloud clone. Wherever docs say `./.venv/bin/python`, use `python3` instead (no packages are needed; Node 22 and Python 3 are preinstalled):

```bash
python3 tests/test_browser_path_adapter.py
python3 -c "import importlib.util as u, inspect; s = u.spec_from_file_location('reg', 'tests/test_browser_regression_registry.py'); m = u.module_from_spec(s); s.loader.exec_module(m); t = [f for n, f in inspect.getmembers(m, inspect.isfunction) if n.startswith('test_')]; [f() for f in t]; print(f'registry: {len(t)}/{len(t)} passed')"
python3 tests/run-browser-regressions.py --dry-run
```

- The registry file has no `__main__`; running it directly executes 0 tests, so use the one-liner above.
- Start from branch `feature/todo-v1-3`. If the session pushes to a different branch (for example `claude/...`), tell the user the exact branch name.

## Current handoff boundary

- V1.7 behavior is implemented and locally verified. The V1.8 visual redesign is implemented in `css/styles.css` (token system + one appended layer) with minimal markup hooks, verified by automated/static checks only; it is committed and pushed on `feature/todo-v1-3` but not packaged.
- The app remains static HTML/CSS/vanilla JavaScript with localStorage + IndexedDB; there is no backend, account system, cloud sync or production REST API.
- Global Search behavior and the no-bulk-actions rule are compatibility constraints.
- Native browser, mobile touch, real IndexedDB/file chooser and visual acceptance remain **manual-pending**. Never report them as green from Node/static checks.
- For a new feature, create or update a versioned design/plan entry, add a focused failing test first, then implement the smallest compatible change.
