# Dailo — Claude project guide

> Documentation synchronized on 2026-10-08 against the V2.0-a source, tests and progress ledgers. V1.7 is the behavior baseline and V1.8 (Quiet Graphite) the visual layer at `https://github.com/marko-ivapix/dailo`. V1.9 "Beta-ready" (installable PWA, offline shell, data protection, Serbian UI, version and problem report) was merged into `main` through PR #5, and **V1.9.1** (problem-report address, Serbian beta tester guide `uputstvo.html`, beta checklist `docs/beta/provera-pre-bete.md`) through PR #6 (`3597343`). Roadmap Phase 4 is implemented on branch `ccr-95f6062b-lgg2fr`: **V1.10 Smart Quick Add** (`c64bd81`), **V1.11 Weekly review** (`5bbd820`) and **V1.12 Duration and time-blocking** (`d00855b`, version `1.12.0`). All three were merged into `main` together through PR #7 (`31fb23d`). The current artifact is `Dailo-v1.12-distributable.zip` (built from the docs commit `5fa586b`; it closes Phase 4, and the V2.0-a alpha has no ZIP of its own); `Dailo-v1.9.1-distributable.zip` is the previous one. The user reported the first iPhone checks as passed (B1–B5). Still manual: B6–B36 of the beta checklist (B25–B30 cover the V1.10–V1.12 features, B31–B36 the sync); the backup reminder notice itself can only appear 7 days after an export. The V2.0 spec (`docs/superpowers/specs/2026-10-08-todo-v2-0-design.md`) was **approved on 2026-10-08** and `AGENTS.md` amended. **V2.0-a Sync in the web app** (version `2.0.0-alpha.1`) is implemented on branch `ccr-95f6062b-lgg2fr` (`65aeabf`, `7a834db` and the release commit that carries these docs) and is not yet merged into `main`. Sync stays off until the user supplies the Supabase project URL and public key for `js/sync-config.js`. V2.0-b (a Capacitor shell for iPhone and Android) was built on 2026-10-08 (`51c098f`, `2bfc2d0`, `d41d203`) and reverted the same day at the user's request: the mobile app waits until the design is reworked and the mobile technology is agreed with the user. The code stays in git history. **Next: design work, starting from examples the user sends.**

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
6. `docs/claude/FEATURES.md` — current V1.3–V2.0-a behavior and known gaps.
7. `docs/claude/DATA_AND_RECOVERY.md` — local persistence, migration and recovery.
8. `docs/claude/TESTING_AND_RELEASE.md` — verification commands and release facts.
9. `docs/claude/WORKING_RULES.md` — safe change and review rules.

Then consult the primary project files:

- `README.md` — current user-facing overview (V2.0-a, V1.12, V1.11, V1.10 and V1.9 highlights first) and run instructions.
- `PROJECT_OVERVIEW.md` — Serbian product overview and brainstorming context.
- `docs/superpowers/specs/2026-09-22-todo-v1-7-design.md` — approved V1.7 stabilization design.
- `docs/superpowers/plans/2026-09-22-todo-v1-7.md` — V1.7 implementation plan.
- `docs/superpowers/progress-v1-7.md` — release evidence and exact verification results.
- `docs/superpowers/specs/2026-10-07-todo-v1-8-design.md` — V1.8 Quiet Graphite / Swiss Compact visual design (tokens, responsive rules, preserved behaviors).
- `docs/superpowers/plans/2026-10-07-todo-v1-8.md` and `docs/superpowers/progress-v1-8.md` — V1.8 plan and per-phase evidence.
- `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md` — approved V1.9 Beta-ready design (PWA install, offline, data protection, Serbian UI, version/problem report, fixes G1–G3, glossary).
- `docs/superpowers/plans/2026-10-07-todo-v1-9.md` and `docs/superpowers/progress-v1-9.md` — V1.9 plan and per-step evidence (Steps 1–7 done; Step 7 shipped as V1.9.1; the user's iPhone results B1–B5 are recorded there, and the manual beta checklist B6–B36 is open).
- `docs/superpowers/specs/2026-10-08-todo-v1-10-design.md`, `docs/superpowers/plans/2026-10-08-todo-v1-10.md` and `docs/superpowers/progress-v1-10.md` — V1.10 Smart Quick Add design, plan and evidence.
- `docs/superpowers/specs/2026-10-08-todo-v1-11-design.md`, `docs/superpowers/plans/2026-10-08-todo-v1-11.md` and `docs/superpowers/progress-v1-11.md` — V1.11 Weekly review design, plan and evidence.
- `docs/superpowers/specs/2026-10-08-todo-v1-12-design.md`, `docs/superpowers/plans/2026-10-08-todo-v1-12.md` and `docs/superpowers/progress-v1-12.md` — V1.12 Duration and time-blocking design, plan and evidence.
- `docs/superpowers/specs/2026-10-08-todo-v2-0-design.md` — V2.0 mobile app + Supabase sync, **approved 2026-10-08** with the user's six decisions.
- `docs/superpowers/plans/2026-10-08-todo-v2-0a.md` and `docs/superpowers/progress-v2-0a.md` — V2.0-a (sync in the web app) plan and evidence; `docs/v2/podesavanje-supabase.md` — Serbian Supabase setup guide for the user; `supabase/migrations/0001_sync.sql` — server schema.
- `docs/superpowers/plans/2026-10-07-release-roadmap.md` — agreed path from the beta to V2.0 (mobile app + Supabase sync).
- `docs/beta/provera-pre-bete.md` — Serbian beta-gate checklist B1–B36 (roadmap Phase 2; B25–B30 cover V1.10–V1.12, B31–B36 the sync once configured); `uputstvo.html` — Serbian guide page for beta testers.

The historical V1.3/V1.4/V1.5/V1.6 specifications and progress ledgers remain useful for intent and regression context. They are not a replacement for current source inspection.

## Source-of-truth rule

For implemented behavior, inspect the current source and tests first. The V1.7 design and release ledger describe the V1.7 behavior baseline; the V1.8–V1.12 specs and ledgers describe the changes on top of it. Older V1.3–V1.6 documents are historical unless the current source and tests confirm the same behavior. If a summary conflicts with source, do not silently guess: record the discrepancy and use the current implementation plus its tests as the factual baseline.

## Project in one paragraph

Dailo is a desktop-first, dark, local-first personal productivity prototype built with static HTML, CSS and vanilla JavaScript. Its workflow is **Capture → Organize → Plan → Complete**. `localStorage` holds compact application metadata; IndexedDB holds attachments, Habit logs, Goal history and recovery snapshots. Since V1.9 the UI is Serbian (Latin script), and the app installs to the Home Screen and starts offline as a PWA. V2.0-a adds optional Supabase sync with e-mail one-time-code sign-in; it is off until `js/sync-config.js` has the project URL and public key, and without an account the app stays fully local.

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

- V1.7 behavior is implemented and locally verified. The V1.8 visual redesign is implemented in `css/styles.css` (token system + one appended layer) with minimal markup hooks, verified by automated/static checks only; it is on `main` and packaged as `Dailo-v1.8-distributable.zip` (older artifact).
- V1.9 Beta-ready (Steps 1–6) was merged into `main` through PR #5. V1.9.1 completes Step 7 and was merged into `main` through PR #6 (`3597343`): `APP_VERSION` and `sw.js` `VERSION` are `1.9.1`, `REPORT_EMAIL` is the address the user supplied on 2026-10-08 with an explicit request to use it (so "Report a problem" is visible; never change it to an address the user has not supplied), Settings → About links `uputstvo.html`, two English fallbacks are translated (the live Quick Add plan chip and the persisted import/reset "Validation" sentences, both now guarded by audit tests), and the package is `Dailo-v1.9.1-distributable.zip` (now the previous artifact). Automated/static checks at V1.9.1: Node 335 tests, 335 passed, 0 failed, 0 todo; the release gate is now a real assertion.
- **V1.10 Smart Quick Add** (spec `docs/superpowers/specs/2026-10-08-todo-v1-10-design.md`, ledger `docs/superpowers/progress-v1-10.md`, `c64bd81`): `Core.parseQuickAdd` is the pure parser (trailing plan date, time, due date and duration clauses; `#tag`, `!priority`, `+project`, `@area` tokens); `Core.parseQuickPlanPhrase` is a thin wrapper and V1.9's `Core.splitQuickTime` is removed. In `js/app.js`, picker values win over parsed ones and `quickParsePreview` shows the recognized fields under the Quick Add title. Checks at V1.10: Node 348 tests, 348 passed; JavaScript syntax 67/67.
- **V1.11 Weekly review** (spec `docs/superpowers/specs/2026-10-08-todo-v1-11-design.md`, ledger `docs/superpowers/progress-v1-11.md`, `5bbd820`): new domain module `js/review-ui.js` (route `#review`, loaded after `js/cleaning-ui.js` and precached) with six numbered sections built from existing rows and links; Core `deriveWeeklyReview`, `weeklyReviewLog`, `recordWeeklyReview`, `weeklyReviewDue`; persisted `settings.weeklyReviews` (`{ weekStart, completedAt }`, at most 26 kept; backup validation rejects more than 52 or invalid entries); a quiet Today notice on the last three days of the week until the week is recorded; sidebar PROGRESS link and phone "Još" entry; `reviewTaskRow` in the domain context. The i18n test now also requires a Latin-only catalog. Checks at V1.11: Node 357 tests, 357 passed; JavaScript syntax 69/69.
- **V1.12 Duration and time-blocking** (spec `docs/superpowers/specs/2026-10-08-todo-v1-12-design.md`, ledger `docs/superpowers/progress-v1-12.md`, `d00855b`): Core `daySchedule`, `dayLoad`, `dailyCapacityMinutes`; persisted `settings.dailyCapacityMinutes` (integer 0–1440, missing = 360, 0 = off; backup validation); Calendar "Dan" view (`ui.calendarView` = `day`) with a capacity bar, a "Bez vremena" list (native time inputs and drag) and an hour grid on the existing calendar drag/drop, `navigateCalendar` moving by one day; a Today capacity item in the focus strip; Settings → General "Dnevni kapacitet"; Quick Add "Trajanje" chip; `durationLabel` in the domain context. `APP_VERSION` and `sw.js` `VERSION` are `1.12.0`; only `tests/time-blocking-v1-12.test.js` pins the exact version, older release tests require "≥".
- Verified at `d00855b`: Node 367 tests, 367 passed, 0 failed, 0 todo (46 test files); JavaScript syntax 70/70; Python AST 19/19; static browser contracts 10/10; registry 3/3; path adapter 2/2. V1.10–V1.12 were merged into `main` together through PR #7 (`31fb23d`); the package is `Dailo-v1.12-distributable.zip` (recipe in `docs/claude/TESTING_AND_RELEASE.md`).
- The browser UI is Serbian only (`sr-Latn`, no language switch). English source strings are the translation keys, and Node tests stay English (`js/i18n.js`, `js/i18n-sr.js`, `tests/support/i18n.js`).
- Dailo installs to the iPhone Home Screen from Safari (`manifest.webmanifest`, `icons/`) and starts offline through a versioned service worker (`sw.js`, cache `dailo-shell-<APP_VERSION>`). Fonts and icons are vendored; no CDN is used at runtime.
- Data protection: persistent-storage request and status, a 7-day backup reminder on Today (24 h snooze) and a backup manifest `releaseVersion`. V1.11 and V1.12 add only two optional settings (`weeklyReviews`, `dailyCapacityMinutes`); V2.0-a adds only the device-local `localStorage` key `dailoSync`, outside state and backups. Schema V3, IndexedDB v1 and ZIP `backupVersion: 2` are unchanged.
- Roadmap Phase 4 (V1.10–V1.12) is done. The **V2.0 spec** was approved on 2026-10-08 (iPhone and Android together, e-mail one-time-code sign-in only with V2.0, last-write-wins, attachments in V2.1, `cloud.ivapix.dailo`, privacy page before the store release).
- **V2.0-a Sync in the web app** (plan `docs/superpowers/plans/2026-10-08-todo-v2-0a.md`, ledger `docs/superpowers/progress-v2-0a.md`):
  - **Server** (`65aeabf`): `supabase/migrations/0001_sync.sql`, with the `records` table, Row Level Security, a server-clock trigger, `record_history` and `delete_my_account()`.
  - **Sync core** (`65aeabf`): `js/sync.js`, with no dependencies, tested against `tests/support/fake-supabase.js`. A device-local shadow drives push-then-pull; conflicts are last-write-wins, and first-sync modes are merge, server and device.
  - **App** (`7a834db`): `js/sync-config.js` (empty), the `app.js` sync block and the Settings "Sinhronizacija" card. Pulls are applied only through `saveState`/`TodoStorage` and never under a dialog, Undo, a pending text save, a drag or a focused text field.
  - **Release:** version `2.0.0-alpha.1`; only `tests/sync-app-v2-0a.test.js` pins it. No ZIP for the alpha.
  - **Checks:** Node 393 tests, 393 passed, 0 failed, 0 todo (48 test files); JavaScript syntax 75/75; Python AST 19/19; static contracts 10/10; registry 3/3; path adapter 2/2.
- **Rules for sync:** the service-role key never enters the repository, and the project URL and public key go into `js/sync-config.js` only when the user supplies them. Next with the user: design work from the user's examples, then agree on the mobile technology (V2.0-b is on hold; do not restore the reverted Capacitor commits without the user's decision). Also: the Supabase project (`docs/v2/podesavanje-supabase.md`), checks B31–B36, a PR when asked. Also run the beta checklist (B6–B30) and invite testers; fixes ship as patches with a failing test first.
- User-facing beta material is Serbian (`docs/beta/`, `uputstvo.html`), an exception to "repository docs are English" like `PROJECT_OVERVIEW.md`. `uputstvo.html` is not in the service-worker precache, so it opens only online.
- The app remains static HTML/CSS/vanilla JavaScript with localStorage + IndexedDB and no build step. The only server is the optional Supabase project of V2.0-a; there is no other backend or production REST API.
- Global Search behavior and the no-bulk-actions rule are compatibility constraints. V1.9 translated the Search modal's fixed labels only (approved exception).
- iPhone results count only when the user reports them: install, standalone layout, airplane-mode start, Serbian UI and Quick Add, favorite star, persistent storage and ZIP export/import passed on 2026-10-08 (B1–B5, table in `docs/superpowers/progress-v1-9.md`). The update notice (B6), B7–B36 (including the V1.10 Quick Add syntax and preview, the V1.11 weekly review, the V1.12 day view, time inputs, drag and capacity, and the V2.0-a sign-in and two-device sync), the backup reminder notice, Mac browser, mobile touch, real file chooser, a route-by-route Serbian wording check (truncation) and visual acceptance remain **manual-pending**. Never report them as green from Node/static checks.
- For a new feature, create or update a versioned design/plan entry, add a focused failing test first, then implement the smallest compatible change. New user-visible text follows the i18n rules in `docs/claude/WORKING_RULES.md`.
