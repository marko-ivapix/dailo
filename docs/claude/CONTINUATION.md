# Claude Code continuation handoff

**Updated:** 2026-10-07  
**Product:** Dailo local-first productivity prototype  
**Current release on `main`:** V1.8 Quiet Graphite / Swiss Compact visual layer over the V1.7 behavior baseline — merged (`994ac71`) at `https://github.com/marko-ivapix/dailo`, packaged as `Dailo-v1.8-distributable.zip`, native visual acceptance manual-pending\
**In progress:** V1.9 Beta-ready — Steps 1–6 implemented, automated checks green and merged into `main` through PR #5; Step 7 (report address, package, manual iPhone pass) open

This is the shortest reliable handoff for continuing the project in Claude Code. Read it after `AGENTS.md` and before opening individual modules.

## Where to work

Work on branch `main` (the GitHub default branch). `feature/todo-v1-3` was merged into `main` on 2026-10-07 and is historical; do not develop on it. V1.9 was developed on branch `ccr-95f6062b-lgg2fr` and merged into `main` through PR #5; finish Step 7 on `main` (or a branch from it).

Use the repository root that contains `index.html`, `css/`, `js/`, `tests/` and `docs/`. In the original local workspace this was the isolated worktree:

```text
todo-app-prototype-v1.3/.worktrees/todo-v1-3
```

The directory name is historical; the behavior baseline is V1.7, the visual layer V1.8 and the beta-ready additions V1.9. Do not switch to the parent archive, the V1.2 folder or a distributable ZIP when making source changes.

The last verified source checkpoint before this documentation sync was `22f9625` (V1.9 Step 6 follow-up, on `ccr-95f6062b-lgg2fr`). Always inspect `git status`, `git log -1` and the actual files before relying on that checkpoint.

## Current status

- V1.7 stabilization is implemented in the source tree.
- The V1.7 release artifact is `Dailo-v1.7-distributable.zip` (SHA-256 `a322d4a854b1171b088e10759af5310a5e0c4d54d00bff46aad1a746ef61f85d`, 42 regular ZIP files, `unzip -t` passed).
- The current artifact is `Dailo-v1.8-distributable.zip` (46 regular files, `unzip -t` passed, reproducible from its source commit; SHA-256 in the `.sha256` sidecar). Build recipe: `docs/claude/TESTING_AND_RELEASE.md`.
- V1.8 visual redesign is implemented in the working tree (2026-10-07). The three earlier boards were never stored in the repository; no direction was selected, so the brief's default **Quiet Graphite / Swiss Compact** was specified in `docs/superpowers/specs/2026-10-07-todo-v1-8-design.md` and implemented per `docs/superpowers/plans/2026-10-07-todo-v1-8.md`. Evidence per phase is in `docs/superpowers/progress-v1-8.md`.
- V1.8 changes are presentation-only: `css/styles.css` (top `:root` token system with every V1.7 token kept as an alias, plus one appended `V1.8 Quiet Graphite / Swiss Compact` layer organized by surface, with the phone touch-target guard kept as the final rule), `index.html` (title/theme color), `js/app.js` (brand tooltip string; loading-surface `role="status"`/`aria-busy`/indicator), `js/tasks-ui.js` (one inline style replaced by a class) and `tests/design-v1-8.test.js`. `js/core.js`, `js/storage.js`, `js/backup.js`, `js/attachments.js` and all Search code are unchanged.
- V1.9 Beta-ready (spec `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md`, plan `docs/superpowers/plans/2026-10-07-todo-v1-9.md`, ledger `docs/superpowers/progress-v1-9.md`) is implemented through Step 6:
  - Step 1 (`6e222fd`): favorite star icon (G1), week-start interpretation through `Core.weekStartKey` (G2), stale Settings row removed (G3), `Core.makeUuid()` fallback (D).
  - Step 2 (`2f368c1`): `js/release.js` (`APP_VERSION = '1.9.0'`, empty `REPORT_EMAIL`, `problemReportMailto`), Settings → About, backup manifest `releaseVersion`.
  - Step 3 (`1c689de`): backup reminder on Today, `backupReminderDays` setting, persistent-storage status and request.
  - Step 4 (`b7b7a49`): `manifest.webmanifest`, `icons/`, iOS standalone meta, safe-area padding, Settings install row.
  - Step 5 (`3f94882`): vendored fonts/icons, `sw.js` offline shell, update prompt.
  - Step 6 (`fa638c5`, `22f9625`): Serbian UI through `js/i18n.js`/`js/i18n-sr.js`, Serbian Quick Add keywords, "Prefix: detail" errors, untranslated-text audit.
- V1.9 is not merged into `main` and not packaged. Every V1.9 iPhone check is **manual-pending**.
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

The verified V1.9 baseline (2026-10-07, after Step 6; `docs/superpowers/progress-v1-9.md`) is:

| Check | Result |
| --- | ---: |
| Node suite | 330 tests: 329 passed, 0 failed, 1 todo (V1.8: 288; +42 V1.9 tests). The todo is the release gate waiting for the problem-report address. |
| JavaScript syntax | 63 files (`js/*.js vendor/*.js tests/*.js`) plus `tests/support/i18n.js` and `sw.js` passed |
| Python AST | 19 files passed |
| Browser-path adapter | 2/2 passed |
| Browser-regression registry | 3/3 passed (invoke the three test functions explicitly — the file has no `__main__`, so running it directly executes 0 tests and exits 0) |
| Static browser contracts | 10/10 passed (`--dry-run`) |
| Diff whitespace | passed |

The V1.8 baseline was 288 Node tests passed, 53 JavaScript files, 19 Python files, 2/2, 3/3 and 10/10.

These checks do not prove native browser layout, touch, file chooser, IndexedDB reload or accessibility behavior.

## Honest acceptance boundary

Native browser acceptance is **manual-pending**. The maintained Python scenarios are a harness, not evidence that a browser was launched. Do not launch isolated Chromium or modify the user's personal Chrome as part of ordinary implementation work. If a user-owned browser run is later performed, record exactly which scenarios passed in the current progress ledger.

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
- `APP_VERSION` in `js/release.js` and `VERSION` in `sw.js` change together on every release (a test enforces it); a changed `sw.js` is how installed apps learn about a new version.

## Safe continuation protocol

1. Read `AGENTS.md`, this file and the relevant `docs/claude/` guide.
2. Inspect the actual source and focused tests; do not infer behavior from old chat messages or unchecked V1.3 checklists.
3. For a behavior change, write/update a versioned spec and plan before broad edits.
4. Add a focused failing test, implement the smallest compatible change, then run focused and full checks.
5. Update the matching progress ledger with evidence, not intention.
6. Re-run the release baseline before claiming completion.

## Remaining V1.9 work (plan Step 7)

1. **Report address.** When the user supplies the beta problem-report e-mail address, set `REPORT_EMAIL` in `js/release.js`. The release-gate test in `tests/release-v1-9.test.js` then turns from `todo` into a real assertion, and the Settings → About "Report a problem" link appears. Never guess an address and never use the user's account e-mail.
2. **Full verification.** Re-run the block above and record it in `docs/superpowers/progress-v1-9.md` (expected: 330 passed, 0 failed, 0 todo).
3. **Package.** Build `Dailo-v1.9-distributable.zip` with the V1.9 recipe in `docs/claude/TESTING_AND_RELEASE.md`, plus its `.sha256` sidecar.
4. **Publish.** Merge the Step 7 changes into `main`; GitHub Pages serves `main`, so the beta URL updates only after that merge.
5. **Manual iPhone checklist** (spec "Acceptance", recorded only from the user's report): install, standalone layout clear of the status bar and home indicator, airplane-mode launch after one online visit, update prompt after a new deploy, persistence status, backup reminder plus export and import into the installed app, full Serbian walkthrough of every route, Serbian Quick Add and the favorite star.

## Recommended next work after V1.9

The agreed release path is in `docs/superpowers/plans/2026-10-07-release-roadmap.md`: V1.9 beta-ready → Phase 2 manual acceptance (beta gate on the user's phone and Mac) → Phase 3 beta launch → Phase 4 features (duration/time-blocking, smart Quick Add, weekly review; V1.10+) → Phase 5 V2.0 mobile app + Supabase sync. Each version needs its own spec and plan first.

Still valid from V1.8:

1. **User-owned-browser visual acceptance of V1.8** at desktop (≥1024px), tablet (701–1023px) and phone (≤700px) widths: sidebar expanded/collapsed, bottom navigation + More sheet, Quick Add, Today, Inbox, Task Properties, Calendar Week/Month/Day Detail, Goals, Habits tracker, Areas, Notes/Resources, Templates, Settings, empty/loading/error states, keyboard focus visibility, reduced motion, `prefers-contrast: more` and forced colors. Record exactly what was observed in `docs/superpowers/progress-v1-8.md`. Serbian strings are longer, so check truncation too.
2. Update the Playwright scenarios (`tests/ui-*.py`) for the Serbian UI if browser automation becomes part of release verification again.
3. Optional follow-up: consolidate the V1.3–V1.7 CSS layers into the V1.8 token system once a visual baseline exists (deferred deliberately in V1.8 to avoid unverified layout regressions).

Keep behavior and persistence unchanged in visual work. Do not mix a visual change with a schema or Search change unless a new approved spec explicitly requires it.

## Suggested Claude Code opening prompt

```text
Continue Dailo from the current V1.9 source tree. Read AGENTS.md, CLAUDE.md and docs/claude/CONTINUATION.md first. Inspect source/tests before changing anything. Native browser and iPhone acceptance is manual-pending; do not claim it from static checks. Preserve Search, no-bulk-actions, local-first storage, delete/Undo and typed RESET/RESTORE invariants, and route every new user-visible string through the Serbian i18n catalog. Finish V1.9 Step 7 (report address, package, PR into main, manual iPhone checklist) before starting the next roadmap phase with its own spec and plan.
```
