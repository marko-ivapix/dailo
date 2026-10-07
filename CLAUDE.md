# Dailo — Claude project guide

> Documentation synchronized on 2026-10-07 against the V1.9 source, tests and progress ledger. V1.7 is the behavior baseline and V1.8 (Quiet Graphite) the visual layer; both are on `main` (`994ac71`) at `https://github.com/marko-ivapix/dailo`, with `Dailo-v1.8-distributable.zip` as the current artifact. V1.9 "Beta-ready" (installable PWA, offline shell, data protection, Serbian UI, version and problem report) is implemented and verified by automated/static checks on branch `ccr-95f6062b-lgg2fr`, pending a PR into `main`. `Dailo-v1.9-distributable.zip` is not built yet: it waits for the beta problem-report e-mail address. Native iPhone and browser acceptance is manual-pending.

This file is the entry point for Claude and other coding agents working in this repository.

## Communicating with the user

Always reply to the user **in Serbian and briefly**: say what it is or what was done, and how it was done. No long reports or exhaustive lists unless the user asks. Code, file names, commands and repository documentation keep their existing language (repository docs are English; `PROJECT_OVERVIEW.md` is Serbian).

The work branch is `main` (the GitHub default branch). `feature/todo-v1-3` was merged into it on 2026-10-07 (PR #2, `994ac71`) and is historical; do not develop on it.

## Read first

Read these files in order:

1. `AGENTS.md` — non-negotiable product and engineering rules.
2. `docs/claude/CONTINUATION.md` — current handoff, verified baseline and next-work protocol.
3. `docs/claude/PROJECT_MAP.md` — repository map and module entry points.
4. `docs/claude/ARCHITECTURE.md` — runtime, rendering and state flow.
5. `docs/claude/DOMAIN_MODEL.md` — entities, links, lifecycle and invariants.
6. `docs/claude/FEATURES.md` — current V1.3–V1.9 behavior and known gaps.
7. `docs/claude/DATA_AND_RECOVERY.md` — local persistence, migration and recovery.
8. `docs/claude/TESTING_AND_RELEASE.md` — verification commands and release facts.
9. `docs/claude/WORKING_RULES.md` — safe change and review rules.

Then consult the primary project files:

- `README.md` — current user-facing overview (V1.9 highlights first) and run instructions.
- `PROJECT_OVERVIEW.md` — Serbian product overview and brainstorming context.
- `docs/superpowers/specs/2026-09-22-todo-v1-7-design.md` — approved V1.7 stabilization design.
- `docs/superpowers/plans/2026-09-22-todo-v1-7.md` — V1.7 implementation plan.
- `docs/superpowers/progress-v1-7.md` — release evidence and exact verification results.
- `docs/superpowers/specs/2026-10-07-todo-v1-8-design.md` — V1.8 Quiet Graphite / Swiss Compact visual design (tokens, responsive rules, preserved behaviors).
- `docs/superpowers/plans/2026-10-07-todo-v1-8.md` and `docs/superpowers/progress-v1-8.md` — V1.8 plan and per-phase evidence.
- `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md` — approved V1.9 Beta-ready design (PWA install, offline, data protection, Serbian UI, version/problem report, fixes G1–G3, glossary).
- `docs/superpowers/plans/2026-10-07-todo-v1-9.md` and `docs/superpowers/progress-v1-9.md` — V1.9 plan and per-step evidence (Steps 1–6 done, Step 7 open).
- `docs/superpowers/plans/2026-10-07-release-roadmap.md` — agreed path from the beta to V2.0 (mobile app + Supabase sync).

The historical V1.3/V1.4/V1.5/V1.6 specifications and progress ledgers remain useful for intent and regression context. They are not a replacement for current source inspection.

## Source-of-truth rule

For implemented behavior, inspect the current source and tests first. The V1.7 design and release ledger describe the V1.7 behavior baseline; the V1.8 and V1.9 specs and ledgers describe the changes on top of it. Older V1.3–V1.6 documents are historical unless the current source and tests confirm the same behavior. If a summary conflicts with source, do not silently guess: record the discrepancy and use the current implementation plus its tests as the factual baseline.

## Project in one paragraph

Dailo is a desktop-first, dark, local-first personal productivity prototype built with static HTML, CSS and vanilla JavaScript. Its workflow is **Capture → Organize → Plan → Complete**. `localStorage` holds compact application metadata; IndexedDB holds attachments, Habit logs, Goal history and recovery snapshots. There is no backend, account system or cloud sync. Since V1.9 the UI is Serbian (Latin script), and the app installs to the Home Screen and starts offline as a PWA.

## Safe default commands

```bash
node --test tests/*.test.js
for file in js/*.js vendor/*.js tests/*.js tests/support/*.js sw.js; do node --check "$file"; done
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
- Start from branch `main`. If the session pushes to a different branch (for example `claude/...`), tell the user the exact branch name.

## Current handoff boundary

- V1.7 behavior is implemented and locally verified. The V1.8 visual redesign is implemented in `css/styles.css` (token system + one appended layer) with minimal markup hooks, verified by automated/static checks only; it is on `main` and packaged as `Dailo-v1.8-distributable.zip` (recipe in `docs/claude/TESTING_AND_RELEASE.md`).
- V1.9 Beta-ready is implemented on branch `ccr-95f6062b-lgg2fr` (Steps 1–6 of its plan) and verified by automated/static checks only: Node 330 tests, 329 passed, 0 failed, 1 todo. The todo is the release gate for the problem-report address.
- The browser UI is Serbian only (`sr-Latn`, no language switch). English source strings are the translation keys, and Node tests stay English (`js/i18n.js`, `js/i18n-sr.js`, `tests/support/i18n.js`).
- Dailo installs to the iPhone Home Screen from Safari (`manifest.webmanifest`, `icons/`) and starts offline through a versioned service worker (`sw.js`, cache `dailo-shell-<APP_VERSION>`). Fonts and icons are vendored; no CDN is used at runtime.
- Data protection: persistent-storage request and status, a 7-day backup reminder on Today (24 h snooze) and a backup manifest `releaseVersion`. Schema V3, IndexedDB v1 and ZIP `backupVersion: 2` are unchanged.
- Still open (plan Step 7): set `REPORT_EMAIL` in `js/release.js` when the user supplies it, build `Dailo-v1.9-distributable.zip`, open the PR into `main`, run the manual iPhone checklist. Never publish an address the user has not supplied.
- The app remains static HTML/CSS/vanilla JavaScript with localStorage + IndexedDB; there is no backend, account system, cloud sync or production REST API.
- Global Search behavior and the no-bulk-actions rule are compatibility constraints. V1.9 translated the Search modal's fixed labels only (approved exception).
- Native browser, iPhone install/standalone/offline, mobile touch, real IndexedDB/file chooser, Serbian wording and visual acceptance remain **manual-pending**. Never report them as green from Node/static checks.
- For a new feature, create or update a versioned design/plan entry, add a focused failing test first, then implement the smallest compatible change. New user-visible text follows the i18n rules in `docs/claude/WORKING_RULES.md`.
