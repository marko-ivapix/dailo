# Claude Code continuation handoff

**Updated:** 2026-10-08\
**Product:** Dailo local-first productivity prototype  
**Current release:** V2.0-a Sync in the web app (`2.0.0-alpha.1`, on `ccr-95f6062b-lgg2fr`: Steps 1–2 `65aeabf`, Step 3 `7a834db`, Step 4 in the commit that carries these docs; not yet merged into `main`). Sync stays off until the user supplies the Supabase project URL and public key for `js/sync-config.js`; until then the app behaves as V1.12. `main` carries V1.12 Duration and time-blocking (`1.12.0`, commit `d00855b`), after V1.10 Smart Quick Add (`c64bd81`) and V1.11 Weekly review (`5bbd820`). All three were merged into `main` together through PR #7 (`31fb23d`) and are packaged as `Dailo-v1.12-distributable.zip` (the current artifact, built from the commit that carries these docs and added in the next commit; it closes roadmap Phase 4). `main` carries V1.9.1 (PR #6, `3597343`): V1.9 Beta-ready (PR #5) plus plan Step 7 — problem-report address, Serbian tester guide `uputstvo.html`, beta checklist `docs/beta/provera-pre-bete.md` — packaged as `Dailo-v1.9.1-distributable.zip` (previous artifact). Behavior baseline V1.7, visual layer V1.8 (`Dailo-v1.8-distributable.zip` is an older artifact)\
**Manual:** iPhone B1–B5 passed (user report, 2026-10-08); the update notice (B6) and B7–B30 are open (B25–B30 cover the V1.10 Quick Add syntax, the duration chip, the weekly review, the Calendar day view, daily capacity and drag on Mac)\
**Next:** the user creates the Supabase project (`docs/v2/podesavanje-supabase.md`) and sends the project URL and public key; then the sync checks B31–B36. V2.0-b (a Capacitor shell for iPhone and Android) was built on 2026-10-08 (`51c098f`, `2bfc2d0`, `d41d203`) and reverted the same day at the user's request: the mobile app waits until the design is reworked and the mobile technology is agreed with the user. The code stays in git history. Next is design work from the user's examples, then a decision on the mobile technology. The V2.0 spec (`docs/superpowers/specs/2026-10-08-todo-v2-0-design.md`) was approved on 2026-10-08 and `AGENTS.md` was amended: optional Supabase sync is allowed, the app keeps working without an account, and the service-role key never enters the repository

This is the shortest reliable handoff for continuing the project in Claude Code. Read it after `AGENTS.md` and before opening individual modules.

## Where to work

Work on branch `main` (the GitHub default branch). `feature/todo-v1-3` was merged into `main` on 2026-10-07 and is historical; do not develop on it. V1.9 was developed on branch `ccr-95f6062b-lgg2fr` and merged into `main` through PR #5. V1.9.1 (Step 7) was prepared on the same branch from `main` at `5554877` and merged into `main` through PR #6 (`3597343`). V1.10 (`c64bd81`), V1.11 (`5bbd820`) and V1.12 (`d00855b`) were committed on the same branch from `main` at `3597343` and reached `main` together through PR #7 (`31fb23d`); GitHub Pages serves `main`. V2.0-a was committed on the same branch from `main` at `31fb23d` (after the docs commits `e7ab3e1` and `ad44e2b`); it reaches `main` only through a PR the user asks for. Start new work from `main` (or a branch from it).

Use the repository root that contains `index.html`, `css/`, `js/`, `tests/` and `docs/`. In the original local workspace this was the isolated worktree:

```text
todo-app-prototype-v1.3/.worktrees/todo-v1-3
```

The directory name is historical; the behavior baseline is V1.7, the visual layer V1.8, the beta-ready additions V1.9, the Phase 4 features V1.10 (Smart Quick Add), V1.11 (Weekly review) and V1.12 (Duration and time-blocking), and the optional sync V2.0-a. Do not switch to the parent archive, the V1.2 folder or a distributable ZIP when making source changes.

The last verified source checkpoint is the V2.0-a release commit that carries this documentation (on `ccr-95f6062b-lgg2fr`, after `7a834db`). Always inspect `git status`, `git log -1` and the actual files before relying on that checkpoint.

## Current status

- V1.7 stabilization is implemented in the source tree.
- The V1.7 release artifact is `Dailo-v1.7-distributable.zip` (SHA-256 `a322d4a854b1171b088e10759af5310a5e0c4d54d00bff46aad1a746ef61f85d`, 42 regular ZIP files, `unzip -t` passed).
- An older artifact is `Dailo-v1.8-distributable.zip` (46 regular files, `unzip -t` passed, reproducible from its source commit; SHA-256 in the `.sha256` sidecar).
- The previous artifact is `Dailo-v1.9.1-distributable.zip` (75 regular files, `unzip -t` passed; SHA-256 only in the `.sha256` sidecar). V1.9.0 was never packaged.
- The current artifact is `Dailo-v1.12-distributable.zip`, built from the commit that carries the V1.11/V1.12 docs and added in the next commit (SHA-256 only in the `.sha256` sidecar; file count and `unzip -t` in `docs/claude/TESTING_AND_RELEASE.md`). V1.10 and V1.11 have no ZIP of their own; this package carries them. Build recipe: `docs/claude/TESTING_AND_RELEASE.md`.
- V1.8 visual redesign is implemented in the working tree (2026-10-07). The three earlier boards were never stored in the repository; no direction was selected, so the brief's default **Quiet Graphite / Swiss Compact** was specified in `docs/superpowers/specs/2026-10-07-todo-v1-8-design.md` and implemented per `docs/superpowers/plans/2026-10-07-todo-v1-8.md`. Evidence per phase is in `docs/superpowers/progress-v1-8.md`.
- V1.8 changes are presentation-only: `css/styles.css` (top `:root` token system with every V1.7 token kept as an alias, plus one appended `V1.8 Quiet Graphite / Swiss Compact` layer organized by surface, with the phone touch-target guard kept as the final rule), `index.html` (title/theme color), `js/app.js` (brand tooltip string; loading-surface `role="status"`/`aria-busy`/indicator), `js/tasks-ui.js` (one inline style replaced by a class) and `tests/design-v1-8.test.js`. `js/core.js`, `js/storage.js`, `js/backup.js`, `js/attachments.js` and all Search code are unchanged.
- V1.9 Beta-ready (spec `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md`, plan `docs/superpowers/plans/2026-10-07-todo-v1-9.md`, ledger `docs/superpowers/progress-v1-9.md`) is implemented through Step 7:
  - Step 1 (`6e222fd`): favorite star icon (G1), week-start interpretation through `Core.weekStartKey` (G2), stale Settings row removed (G3), `Core.makeUuid()` fallback (D).
  - Step 2 (`2f368c1`): `js/release.js` (`APP_VERSION = '1.9.0'`, empty `REPORT_EMAIL`, `problemReportMailto`), Settings → About, backup manifest `releaseVersion`.
  - Step 3 (`1c689de`): backup reminder on Today, `backupReminderDays` setting, persistent-storage status and request.
  - Step 4 (`b7b7a49`): `manifest.webmanifest`, `icons/`, iOS standalone meta, safe-area padding, Settings install row.
  - Step 5 (`3f94882`): vendored fonts/icons, `sw.js` offline shell, update prompt.
  - Step 6 (`fa638c5`, `22f9625`): Serbian UI through `js/i18n.js`/`js/i18n-sr.js`, Serbian Quick Add keywords, "Prefix: detail" errors, untranslated-text audit.
  - Steps 1–6 merged into `main` through PR #5 (`5554877`, 2026-10-08).
  - Step 7 = **V1.9.1** (2026-10-08): `APP_VERSION` and `sw.js` `VERSION` `1.9.1`; `REPORT_EMAIL` set to the address the user supplied (Settings → About shows "Report a problem"); Settings → About links the Serbian tester guide `uputstvo.html` (online only, not precached); two English fallbacks translated (live Quick Add plan chip, persisted import/reset "Validation" sentences) with two new audit tests; `docs/beta/provera-pre-bete.md` (B1–B24); `tests/beta-v1-9-1.test.js`; package `Dailo-v1.9.1-distributable.zip`. Merged into `main` through PR #6 (`3597343`).
- **V1.10 Smart Quick Add** (spec `docs/superpowers/specs/2026-10-08-todo-v1-10-design.md`, plan `docs/superpowers/plans/2026-10-08-todo-v1-10.md`, ledger `docs/superpowers/progress-v1-10.md`) is committed as `c64bd81` and merged into `main` through PR #7:
  - `js/core.js`: pure `Core.parseQuickAdd(text, { today, tags, projects, areas, parsePlan })`. Trailing clauses are read right to left, in any order, one per kind: plan date, time, due date (`rok`/`due` + day, `do` + genitive weekday, `sutra` or a date) and duration (1–1440 min). `#tag`, `!high/medium/low`, `!visok/srednji/nizak`, `+project` and `@area` work anywhere. `Core.parseQuickPlanPhrase` is a thin wrapper (plan date and time only); `Core.splitQuickTime` (V1.9) is removed.
  - `js/app.js`: `parseQuickAddTitle` delegates to the parser; `createTask` applies the parsed due date, duration, project and Area after the picker values (pickers win; a project wins over an Area; Inbox placement and project order use the resolved project); `quickParsePreview` renders the recognized fields as pills in `data-quick-preview-slot` (`aria-live="polite"`) on every keystroke.
  - CSS V1.10 layer before the touch-target guard; catalog +1 entry ("Recognized in title" → "Prepoznato u naslovu", 1426 entries); `uputstvo.html` lists the new syntax.
  - `APP_VERSION` and `sw.js` `VERSION` `1.10.0` in that release. At the time `tests/quick-add-v1-10.test.js` pinned the exact version (since V1.11 it requires 1.10.0 or later); `tests/release-v1-9.test.js` and `tests/beta-v1-9-1.test.js` now require "≥ V1.9" / "≥ 1.9.1" and that `sw.js` follows `APP_VERSION`.
  - Intended behavior changes: a weekday after `za` is no longer parsed (`za nedelju` stays in the title), and the first priority token wins (V1.5 took the last).
- **V1.11 Weekly review** (spec `docs/superpowers/specs/2026-10-08-todo-v1-11-design.md`, plan `docs/superpowers/plans/2026-10-08-todo-v1-11.md`, ledger `docs/superpowers/progress-v1-11.md`) is committed as `5bbd820` and merged into `main` through PR #7:
  - `js/core.js`: `Core.deriveWeeklyReview(state, today, weekStartsOn)` (week start, active Inbox, overdue, missed plans, next 7 days with planned/due counts, active goals with health, active habits, Areas with open-task counts); `Core.weeklyReviewLog`, `Core.recordWeeklyReview`, `Core.weeklyReviewDue` (last three days of the week until the week has a record).
  - Persisted `settings.weeklyReviews`: `{ weekStart, completedAt }` entries, newest first, one per week, at most 26 kept. `js/backup.js` rejects a value that is not an array of at most 52 valid entries (`Invalid backup: weeklyReviews`), on export and import.
  - `js/review-ui.js` (domain module `review`, route `#review`), loaded in `index.html` after `js/cleaning-ui.js` and precached in `sw.js`: six numbered sections (Inbox, overdue and missed plans, next 7 days, Goals, Habits, Areas) with the existing row actions and links, per-section empty notes, "Završi nedeljni pregled" (`complete-weekly-review`) and a done note with up to four previous reviews.
  - `js/app.js`: route `review`; sidebar PROGRESS link and phone "Još" entry ("Nedeljni pregled", `ph-clipboard-text`); `reviewTaskRow` in the domain context; `weeklyReviewNotice()` on Today after the backup reminder; `completeWeeklyReview()`.
  - CSS V1.11 layer; catalog +21 entries (1447); `tests/i18n-v1-9.test.js` now also requires a Latin-only catalog. Version `1.11.0` (no longer current).
- **V1.12 Duration and time-blocking** (spec `docs/superpowers/specs/2026-10-08-todo-v1-12-design.md`, plan `docs/superpowers/plans/2026-10-08-todo-v1-12.md`, ledger `docs/superpowers/progress-v1-12.md`) is committed as `d00855b` and merged into `main` through PR #7:
  - `js/core.js`: `Core.daySchedule(tasks, date, { defaultMinutes = 30 })` (blocks with `estimated` and open-only `conflict`, unscheduled list, hour range 06–24 starting earlier for an earlier block), `Core.dayLoad(tasks, date)`, `Core.dailyCapacityMinutes(settings)` (integer 0–1440, otherwise 360; 0 = off).
  - Persisted `settings.dailyCapacityMinutes`; `js/backup.js` rejects a value that is not an integer 0–1440 (`Invalid backup: dailyCapacityMinutes`).
  - `js/calendar-ui.js`: "Dan" / "Nedelja" / "Mesec" switch and `renderDayView` — capacity bar ("Planirano {planned} od {capacity}", over-capacity warning), "Bez vremena" list (native time input on the existing `data-task-time="plannedTime"` handler, draggable through `data-calendar-drag="task"`), hour grid of `data-calendar-time="HH:00"` rows on the existing calendar drop handler, blocks with `has-conflict`, `is-estimated` and `is-completed`, and an empty-day note with "Dodaj zadatak".
  - `js/app.js`: `ui.calendarView` keeps `day`; `navigateCalendar` moves by one day in the day view; `durationLabel` (also in the domain context) and `todayCapacityItem` in the Today focus strip; Quick Add "Trajanje" chip with 15–120 min presets (`set-duration`), which wins over a parsed duration; the `daily-capacity` change handler. `js/settings-ui.js`: Settings → General "Dnevni kapacitet".
  - CSS V1.12 layer; catalog +15 entries (1462); `uputstvo.html` sections "Nedeljni pregled" (V1.11) and "Raspored dana" (V1.12).
  - `APP_VERSION` and `sw.js` `VERSION` `1.12.0`. Only `tests/time-blocking-v1-12.test.js` pins the exact version; the V1.10 and V1.11 release tests require "≥ 1.10.0" / "≥ 1.11.0".
- **V2.0-a Sync in the web app** (spec `docs/superpowers/specs/2026-10-08-todo-v2-0-design.md`, approved 2026-10-08; plan `docs/superpowers/plans/2026-10-08-todo-v2-0a.md`; ledger `docs/superpowers/progress-v2-0a.md`):
  - Server (`65aeabf`): `supabase/migrations/0001_sync.sql` (`records` with Row Level Security `user_id = auth.uid()`, server-clock `updated_at` trigger, `record_history` trigger, `delete_my_account()`), the Serbian setup guide `docs/v2/podesavanje-supabase.md`.
  - `js/sync.js` (`65aeabf`, `root.DailoSync`, no dependencies): `collectRecords`, `hashRecord`, `diffRecords`, `applyRemote`, `createClient` (e-mail one-time code through `/auth/v1/otp` and `/auth/v1/verify`, refresh, sign-out, account deletion, paged pull, batched upsert), `syncOnce` (push, shadow commit, pull with a 5-second overlap; first-sync modes `merge`/`server`/`device` and `choose`), `isConfigured`. Tested against `tests/support/fake-supabase.js`.
  - App (`7a834db`): `js/sync-config.js` (empty and frozen), loaded with `js/sync.js` after `js/backup.js` and precached; the `app.js` sync block (`runSync`, `scheduleSync`, `applySyncResult`, sign-in, sign-out, account deletion with typed `OBRIŠI`, first-sync choice `sync-choice` with a forced automatic snapshot, `startSync`); the Settings "Sinhronizacija" card shown only when configured; `syncView` in the domain context.
  - Step 4: `APP_VERSION` and `sw.js` `VERSION` `2.0.0-alpha.1`; only `tests/sync-app-v2-0a.test.js` pins the exact version. No distributable ZIP for the alpha.
- iPhone results reported by the user on 2026-10-08 (V1.9 ledger table, B1–B5): install from Safari, standalone layout clear of the status bar and home indicator, airplane-mode start, Serbian UI and Quick Add, favorite star, persistent storage granted, ZIP export and import. Everything else, including the V1.10–V1.12 features (beta checklist B25–B30), is **manual-pending**.
- The V1.8 work (`4cfab6c`) and `Dailo-v1.8-distributable.zip` were merged into `feature/todo-v1-3` (PR #1) and then into `main` (PR #2, `994ac71`) on 2026-10-07; packaging evidence is in `docs/superpowers/progress-v1-8.md`. The two branches had unrelated histories; PR #2 joined them with an `-s ours` merge that kept the `feature/todo-v1-3` tree, so `main` carries the V1.8 tree and the older V1.2/early-V1.3 `main` commits remain only as history.

## Verified automated baseline

Run from the repository root:

```bash
node --test tests/*.test.js
for file in js/*.js vendor/*.js tests/*.js tests/support/*.js sw.js; do node --check "$file"; done
python3 - <<'PY'
import ast, pathlib
paths = sorted(pathlib.Path('tests').glob('*.py'))
for path in paths:
    ast.parse(path.read_text())
print(f'python AST: {len(paths)} files passed')
PY
python3 tests/test_browser_path_adapter.py
python3 -c "import importlib.util as u, inspect; s = u.spec_from_file_location('reg', 'tests/test_browser_regression_registry.py'); m = u.module_from_spec(s); s.loader.exec_module(m); t = [f for n, f in inspect.getmembers(m, inspect.isfunction) if n.startswith('test_')]; [f() for f in t]; print(f'registry: {len(t)}/{len(t)} passed')"
python3 tests/run-browser-regressions.py --dry-run
git diff --check
```

Use `./.venv/bin/python` instead of `python3` where a local `.venv` exists; no packages are needed for these checks.

The verified V2.0-a baseline (2026-10-08, the release commit that carries these docs; `docs/superpowers/progress-v2-0a.md`) is:

| Check | Result |
| --- | ---: |
| Node suite | 393 tests: 393 passed, 0 failed, 0 todo (V1.12: 367; V2.0-a: +12 in `tests/sync-v2-0a.test.js` and +14 in `tests/sync-app-v2-0a.test.js`), 48 `tests/*.test.js` files |
| JavaScript syntax | 75 files passed (`js/*.js vendor/*.js tests/*.js tests/support/*.js sw.js`) |
| Python AST | 19 files passed |
| Browser-path adapter | 2/2 passed |
| Browser-regression registry | 3/3 passed (invoke the three test functions explicitly — the file has no `__main__`, so running it directly executes 0 tests and exits 0) |
| Static browser contracts | 10/10 passed (`--dry-run`) |
| Diff whitespace | passed |

The V1.12 baseline (`d00855b`, `docs/superpowers/progress-v1-12.md`) was 367 Node tests and 70 JavaScript files; the V1.11 baseline (`docs/superpowers/progress-v1-11.md`) was 357 Node tests and 69 JavaScript files; the V1.10 baseline (`docs/superpowers/progress-v1-10.md`) was 348 Node tests and 67 JavaScript files; the V1.9.1 baseline (Step 7, `docs/superpowers/progress-v1-9.md`) was 335 Node tests (335 passed, 0 todo) and 66 JavaScript files; the V1.9 Step 6 baseline was 330 Node tests (329 passed, 1 todo) and 63 + 2 JavaScript files; the V1.8 baseline was 288 Node tests passed, 53 JavaScript files, 19 Python files, 2/2, 3/3 and 10/10.

These checks do not prove native browser layout, touch, file chooser, IndexedDB reload or accessibility behavior.

## Honest acceptance boundary

Native browser acceptance is **manual-pending**, except the iPhone items the user reported (B1–B5 in the V1.9 ledger table). The maintained Python scenarios are a harness, not evidence that a browser was launched. Do not launch isolated Chromium or modify the user's personal Chrome as part of ordinary implementation work. If a user-owned browser run is later performed, record exactly which scenarios passed in the current progress ledger.

## Product invariants to preserve

- One canonical Task record; Today, Inbox, Upcoming, Anytime, Projects, Tags and Completed are derived views.
- `plannedDate`/`plannedTime` and `dueDate`/`dueTime` stay independent.
- Priority is metadata only; it does not change Search or Today ordering.
- Projects stay flat; Project Area inheritance applies to Project Tasks.
- Goals and Habits keep their documented lifecycle, reciprocal links, history and reminder rules.
- Notes and Resources are separate entity types and share attachment ownership rules.
- Normal deletion is Confirmation → Delete → Snackbar Undo.
- Reset/Replace All require safety ZIP, recovery snapshot, typed `RESET`/`RESTORE`, verification and rollback.
- Search remains unchanged; no bulk action UI is allowed. Only the Search modal's fixed labels are translated (V1.9 approved exception).
- User-visible text goes through the i18n catalog; persisted values, IDs and the typed words `RESET`/`RESTORE` stay unchanged.
- `APP_VERSION` in `js/release.js` and `VERSION` in `sw.js` change together on every release (a test enforces it); a changed `sw.js` is how installed apps learn about a new version. Only the newest release test pins the exact version; older release tests require "this version or later".
- Quick Add parsing stays in the pure `Core.parseQuickAdd`; values chosen in the Quick Add pickers win over parsed ones, unknown `#`/`+`/`@` tokens stay in the title, and nothing is created from a token.
- `REPORT_EMAIL` is only ever an address the user supplied (set in V1.9.1). User-facing beta material (`docs/beta/`, `uputstvo.html`) is Serbian.
- The weekly review log (`settings.weeklyReviews`) and the daily capacity (`settings.dailyCapacityMinutes`) are optional settings with Core readers that tolerate missing or invalid values and with backup validation; they need no schema change. The weekly review and the Today notice add no bulk action and never open a modal.
- Sync (V2.0-a) is optional and off until `js/sync-config.js` holds the project URL and the public anon/publishable key; the `service_role`/secret key never enters the repository (a test rejects it). The app works fully without an account.
- The local store stays the source of truth. The device-local `dailoSync` record (session, shadow, cursor) is never in state or backups. `ui`, `attachmentIds`, `settings.backupStatus` and `settings.compactDensity` never sync; goal history and attachments wait for V2.1.
- Pulled data is applied only through `saveState` and `TodoStorage`, and never while a dialog, Undo, a pending text save, a drag or a focused text field is active, or during recovery or a global operation. Conflicts are last-write-wins per record; the replaced server version stays in `record_history`.
- The Calendar day view is a projection of Task `plannedDate`/`plannedTime`/`durationMinutes`: it reuses the existing calendar drag/drop and the `data-task-time` handler and adds no event store. An estimated block (no duration) is drawn with 30 minutes but nothing is written to the Task.

## Safe continuation protocol

1. Read `AGENTS.md`, this file and the relevant `docs/claude/` guide.
2. Inspect the actual source and focused tests; do not infer behavior from old chat messages or unchecked V1.3 checklists.
3. For a behavior change, write/update a versioned spec and plan before broad edits.
4. Add a focused failing test, implement the smallest compatible change, then run focused and full checks.
5. Update the matching progress ledger with evidence, not intention.
6. Re-run the release baseline before claiming completion.

## V1.9 Step 7 — done as V1.9.1

1. **Report address** set in `js/release.js` (supplied by the user on 2026-10-08); the release gate in `tests/release-v1-9.test.js` is a real assertion and Settings → About shows "Report a problem".
2. **Full verification** recorded in `docs/superpowers/progress-v1-9.md`: 335 Node tests, 335 passed, 0 failed, 0 todo.
3. **Package** `Dailo-v1.9.1-distributable.zip` plus `.sha256` sidecar, built from the docs commit with the recipe in `docs/claude/TESTING_AND_RELEASE.md` and added in the next commit.
4. **Manual checklist** handed over as `docs/beta/provera-pre-bete.md` (Serbian, B1–B24) together with the tester guide `uputstvo.html`.
5. **Publish.** Merged into `main` through PR #6 (`3597343`), so GitHub Pages serves V1.9.1 and the updated guide.

Still open, with the user:

- **B6, the update notice**, is the next manual check: an installed app on an older version should show "Dostupna je nova verzija Dailo-a." with **Osveži** once a release with a changed `sw.js` is on `main` (V1.9.1 since PR #6, V1.12.0 after the Phase 4 PR is merged); afterwards Settings → O aplikaciji shows the new version and **Prijavi problem**. Then B7–B30 (iPhone and Mac; B25–B30 cover V1.10–V1.12). The backup reminder notice can only appear 7 days after an export. Record results in the V1.9 ledger only from the user's report; fixes ship as patches with a failing test first.

## Roadmap Phase 4 (V1.10–V1.12) — done, merged through PR #7

1. **V1.10 Smart Quick Add** — parser, saving and preview per spec A–E. Evidence: `docs/superpowers/progress-v1-10.md` (348 Node tests, 348 passed; JavaScript syntax 67/67).
2. **V1.11 Weekly review** — `#review` page, Today notice and review log per spec A–D. Evidence: `docs/superpowers/progress-v1-11.md` (357 Node tests, 357 passed; JavaScript syntax 69/69).
3. **V1.12 Duration and time-blocking** — Calendar day view, Today capacity, Settings "Dnevni kapacitet", Quick Add "Trajanje" chip per spec A–E. Evidence: `docs/superpowers/progress-v1-12.md` (367 Node tests, 367 passed, 0 failed, 0 todo; JavaScript syntax 70/70; static contracts 10/10; `git diff --check` passed); Python AST 19/19, registry 3/3 and path adapter 2/2 were also verified at `d00855b`.
4. **Docs sync** for V1.11 and V1.12 (README, `CLAUDE.md`, `docs/claude/*`, `PROJECT_OVERVIEW.md`, roadmap).
5. **Package** `Dailo-v1.12-distributable.zip` plus `.sha256` sidecar, built from the docs commit with the recipe in `docs/claude/TESTING_AND_RELEASE.md` and added in the next commit. It closes Phase 4; V1.10 and V1.11 have no ZIP of their own.

Still open: the user's checks B25–B30 on iPhone and Mac (**manual-pending**; record them in the matching V1.10/V1.11/V1.12 ledger only from the user's report).

## Recommended next work after V1.12

The agreed release path is in `docs/superpowers/plans/2026-10-07-release-roadmap.md`: V1.9 beta-ready (done, V1.9.1) → Phase 2 manual acceptance (beta gate `docs/beta/provera-pre-bete.md` B1–B30 on the user's phone and Mac; B1–B5 passed) → Phase 3 beta launch (guide `uputstvo.html` done; invites open) → Phase 4 features (done: V1.10–V1.12) → Phase 5 V2.0 mobile app + Supabase sync.

Next:

1. **V2.0** — spec `docs/superpowers/specs/2026-10-08-todo-v2-0-design.md`, approved on 2026-10-08 with the user's six decisions: iPhone and Android together; e-mail one-time code (no password) only with V2.0; last-write-wins per record; attachments in V2.1; "Dailo" with the id `cloud.ivapix.dailo`; the privacy page before the store release. V2.0-a (web sync) is implemented. What remains:
   - **the user:** creates the Supabase EU project per `docs/v2/podesavanje-supabase.md` and sends the project URL and the public key, which then go into `js/sync-config.js` (with a version bump so installed apps update). Then run checks B31–B36. Real sign-in and two-device sync are **manual-pending** until then.
   - **V2.0-b:** on hold. The Capacitor shell was built and reverted on 2026-10-08 (`51c098f`, `2bfc2d0`, `d41d203`); the user first wants the design reworked, then to agree on the mobile technology. Do not restore it without the user's decision.
   - **V2.0-c:** privacy page, store texts, TestFlight and Play internal testing; it needs Apple Developer and Google Play accounts and signing on the user's Mac.
2. **With the user** — a PR for V2.0-a when the user asks, the beta checklist B6–B30, invites for testers (Phase 3), and fixes as patches with a failing test first.

Still valid from V1.8:

1. **User-owned-browser visual acceptance of V1.8** at desktop (≥1024px), tablet (701–1023px) and phone (≤700px) widths: sidebar expanded/collapsed, bottom navigation + More sheet, Quick Add, Today, Inbox, Task Properties, Calendar Week/Month/Day Detail, Goals, Habits tracker, Areas, Notes/Resources, Templates, Settings, empty/loading/error states, keyboard focus visibility, reduced motion, `prefers-contrast: more` and forced colors. Record exactly what was observed in `docs/superpowers/progress-v1-8.md`. Serbian strings are longer, so check truncation too.
2. Update the Playwright scenarios (`tests/ui-*.py`) for the Serbian UI if browser automation becomes part of release verification again.
3. Optional follow-up: consolidate the V1.3–V1.7 CSS layers into the V1.8 token system once a visual baseline exists (deferred deliberately in V1.8 to avoid unverified layout regressions).

Keep behavior and persistence unchanged in visual work. Do not mix a visual change with a schema or Search change unless a new approved spec explicitly requires it.

## Suggested Claude Code opening prompt

```text
Continue Dailo from the current V2.0-a source tree. Read AGENTS.md, CLAUDE.md and docs/claude/CONTINUATION.md first. Inspect source/tests before changing anything. Native browser and iPhone acceptance is manual-pending except what the user reported (V1.9 ledger table); do not claim it from static checks. Preserve Search, no-bulk-actions, local-first storage, delete/Undo and typed RESET/RESTORE invariants, and route every new user-visible string through the Serbian i18n catalog. The V2.0 spec (docs/superpowers/specs/2026-10-08-todo-v2-0-design.md) is approved: sync is optional, the app works without an account, and the service_role key never enters the repository; only the user supplies the Supabase URL and public key. Any new feature still needs its own versioned spec and plan, and a failing test first.
```
