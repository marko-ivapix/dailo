# Dailo — Claude project guide

> Documentation synchronized on 2026-10-08 against the V1.9.1 source, tests and progress ledger. V1.7 is the behavior baseline and V1.8 (Quiet Graphite) the visual layer at `https://github.com/marko-ivapix/dailo`. V1.9 "Beta-ready" (installable PWA, offline shell, data protection, Serbian UI, version and problem report) was merged into `main` through PR #5. **V1.9.1** completes V1.9 plan Step 7: the problem-report address is set, Settings → About links the Serbian beta tester guide `uputstvo.html`, and `docs/beta/provera-pre-bete.md` is the beta checklist (B1–B24). The current artifact is `Dailo-v1.9.1-distributable.zip` (`Dailo-v1.8-distributable.zip` is the previous one; V1.9.0 was never packaged). The user reported the first iPhone checks as passed (B1–B5). Still manual: the update notice (B6) and the rest of the beta checklist (B7–B24); the backup reminder notice itself can only appear 7 days after an export.

This file is the entry point for Claude and other coding agents working in this repository.

## Communicating with the user

Always reply to the user **in Serbian and briefly**: say what it is or what was done, and how it was done. No long reports or exhaustive lists unless the user asks. Code, file names, commands and repository documentation keep their existing language (repository docs are English; `PROJECT_OVERVIEW.md` and the user-facing beta material — `docs/beta/` and the guide page `uputstvo.html` — are Serbian).

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
- `docs/superpowers/plans/2026-10-07-todo-v1-9.md` and `docs/superpowers/progress-v1-9.md` — V1.9 plan and per-step evidence (Steps 1–7 done; Step 7 shipped as V1.9.1; the manual beta checklist B6–B24 is open).
- `docs/superpowers/plans/2026-10-07-release-roadmap.md` — agreed path from the beta to V2.0 (mobile app + Supabase sync).
- `docs/beta/provera-pre-bete.md` — Serbian beta-gate checklist B1–B24 (roadmap Phase 2); `uputstvo.html` — Serbian guide page for beta testers.

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

- V1.7 behavior is implemented and locally verified. The V1.8 visual redesign is implemented in `css/styles.css` (token system + one appended layer) with minimal markup hooks, verified by automated/static checks only; it is on `main` and packaged as `Dailo-v1.8-distributable.zip` (previous artifact).
- V1.9 Beta-ready (Steps 1–6) was merged into `main` through PR #5. V1.9.1 completes Step 7: `APP_VERSION` and `sw.js` `VERSION` are `1.9.1`, `REPORT_EMAIL` is the address the user supplied on 2026-10-08 with an explicit request to use it (so "Report a problem" is visible; never change it to an address the user has not supplied), Settings → About links `uputstvo.html`, two English fallbacks are translated (the live Quick Add plan chip and the persisted import/reset "Validation" sentences, both now guarded by audit tests), and the package is `Dailo-v1.9.1-distributable.zip` (recipe in `docs/claude/TESTING_AND_RELEASE.md`). Automated/static checks: Node 335 tests, 335 passed, 0 failed, 0 todo; the release gate is now a real assertion.
- The browser UI is Serbian only (`sr-Latn`, no language switch). English source strings are the translation keys, and Node tests stay English (`js/i18n.js`, `js/i18n-sr.js`, `tests/support/i18n.js`).
- Dailo installs to the iPhone Home Screen from Safari (`manifest.webmanifest`, `icons/`) and starts offline through a versioned service worker (`sw.js`, cache `dailo-shell-<APP_VERSION>`). Fonts and icons are vendored; no CDN is used at runtime.
- Data protection: persistent-storage request and status, a 7-day backup reminder on Today (24 h snooze) and a backup manifest `releaseVersion`. Schema V3, IndexedDB v1 and ZIP `backupVersion: 2` are unchanged.
- Next work (roadmap Phase 4, requested by the user on 2026-10-08), each with its own versioned spec and plan and a failing test first: **V1.10 Smart Quick Add**, **V1.11 Weekly review**, **V1.12 Duration + time-blocking**; plus a **V2.0 spec draft** (mobile app + Supabase sync), which may amend the no-backend rule only once the user approves it. Running the beta checklist (B6–B24) and inviting testers stay with the user; fixes from it ship as V1.9.x patches.
- User-facing beta material is Serbian (`docs/beta/`, `uputstvo.html`), an exception to "repository docs are English" like `PROJECT_OVERVIEW.md`. `uputstvo.html` is not in the service-worker precache, so it opens only online.
- The app remains static HTML/CSS/vanilla JavaScript with localStorage + IndexedDB; there is no backend, account system, cloud sync or production REST API.
- Global Search behavior and the no-bulk-actions rule are compatibility constraints. V1.9 translated the Search modal's fixed labels only (approved exception).
- iPhone results count only when the user reports them: install, standalone layout, airplane-mode start, Serbian UI and Quick Add, favorite star, persistent storage and ZIP export/import passed on 2026-10-08 (B1–B5, table in `docs/superpowers/progress-v1-9.md`). The update notice (B6), B7–B24, the backup reminder notice, Mac browser, mobile touch, real file chooser, a route-by-route Serbian wording check (truncation) and visual acceptance remain **manual-pending**. Never report them as green from Node/static checks.
- For a new feature, create or update a versioned design/plan entry, add a focused failing test first, then implement the smallest compatible change. New user-visible text follows the i18n rules in `docs/claude/WORKING_RULES.md`.
