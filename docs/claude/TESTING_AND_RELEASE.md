# Testing and release guide

This document records the current verification path. It does not turn source inspection into browser acceptance.

## Run the local automated suite

From the repository root (branch `main`):

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

These checks need no Python packages. Where a local `.venv` exists (gitignored, so not in cloud clones), `./.venv/bin/python` can replace `python3`.

Current V2.0-a evidence (2026-10-08, the release commit after `7a834db`; see `docs/superpowers/progress-v2-0a.md`), Node v22.22.0 and Python 3.13.16:

| Check | Result |
| --- | ---: |
| Complete Node suite | **393 tests: 393 passed, 0 failed, 0 todo** (367 at V1.12; V2.0-a +12 in `tests/sync-v2-0a.test.js` and +14 in `tests/sync-app-v2-0a.test.js`); 48 `tests/*.test.js` files |
| JavaScript syntax | **75 files passed** (`js/*.js vendor/*.js tests/*.js tests/support/*.js sw.js`) |
| Python AST parsing | **19 files passed** (`tests/*.py`) |
| Static browser contracts | **10/10 passed** (`--dry-run`) |
| Browser-regression registry contracts | **3/3 passed** (functions invoked explicitly) |
| Browser-path adapter unittest | **2/2 passed** |
| `git diff --check` | passed |

Other facts at V2.0-a: `APP_VERSION` and `sw.js` `VERSION` are `2.0.0-alpha.1`; the Serbian catalog has 1502 entries; the `sw.js` precache list has 41 files (adds `js/sync-config.js` and `js/sync.js`). The alpha has no distributable ZIP; `Dailo-v1.12-distributable.zip` stays the current artifact. These checks run the sync against the in-memory fake server only; real Supabase sign-in and two-device sync are manual-pending (B31–B36).

V1.12 evidence (2026-10-08, commit `d00855b`; see `docs/superpowers/progress-v1-12.md`):

| Check | Result |
| --- | ---: |
| Complete Node suite | **367 tests: 367 passed, 0 failed, 0 todo** (348 at V1.10; V1.11 +9: eight in `tests/weekly-review-v1-11.test.js` and the Latin-only catalog test in `tests/i18n-v1-9.test.js`; V1.12 +10 in `tests/time-blocking-v1-12.test.js`); 46 `tests/*.test.js` files |
| JavaScript syntax | **70 files passed** (`js/*.js vendor/*.js tests/*.js tests/support/*.js sw.js`) |
| Python AST parsing | **19 files passed** (`tests/*.py`) |
| Static browser contracts | **10/10 passed** (`--dry-run`) |
| Browser-regression registry contracts | **3/3 passed** (functions invoked explicitly) |
| Browser-path adapter unittest | **2/2 passed** |
| `git diff --check` | passed |

Other facts at `d00855b`: `APP_VERSION` and `sw.js` `VERSION` are `1.12.0`; the Serbian catalog has 1462 entries; the `sw.js` precache list has 39 files.

V1.11 (`5bbd820`, `docs/superpowers/progress-v1-11.md`) recorded 357 tests (357 passed, 0 todo) and 69 JavaScript files; V1.10 (`c64bd81`, `docs/superpowers/progress-v1-10.md`) recorded 348 tests (348 passed, 0 todo), 67 JavaScript files and 44 test files. Both ledgers record static contracts 10/10; the V1.10 ledger also records registry 3/3 and path adapter 2/2.

V1.9.1 evidence (2026-10-08, V1.9 plan Step 7; see `docs/superpowers/progress-v1-9.md`):

| Check | Result |
| --- | ---: |
| Complete Node suite | **335 tests: 335 passed, 0 failed, 0 todo** (288 from V1.8 plus 47 in eight V1.9/V1.9.1 files: seven `tests/*-v1-9.test.js` and `tests/beta-v1-9-1.test.js`). The release gate in `tests/release-v1-9.test.js` is a real assertion now that `REPORT_EMAIL` is set. |
| JavaScript syntax | **66 files passed**: 64 (`js/*.js vendor/*.js tests/*.js`) plus `tests/support/i18n.js` and `sw.js` |
| Python AST parsing | **19 files passed** (`tests/*.py`) |
| Static browser contracts | **10/10 passed** (`--dry-run`: 2 + 3 + 5) |
| Browser-regression registry contracts | **3/3 passed** (functions invoked explicitly) |
| Browser-path adapter unittest | **2/2 passed** |
| `git diff --check` | passed (new untracked files checked against a temporary copy of the index) |

V1.9 Step 6 (2026-10-07) recorded 330 tests: 329 passed, 0 failed, 1 todo (the release gate while the address was empty), and 63 + 2 JavaScript files.

V1.8 evidence (2026-10-07, after the visual redesign; see `docs/superpowers/progress-v1-8.md`):

| Check | Result |
| --- | ---: |
| Complete Node suite | **288 passed, 0 failed, 0 skipped** (includes 37 V1.8 design contracts in `tests/design-v1-8.test.js`) |
| JavaScript syntax | **53 files passed** |
| Python AST parsing | **19 files passed** |
| Static browser contracts | **10/10 passed** |
| Browser-regression registry contracts | **3/3 passed** (functions invoked explicitly) |
| Browser-path adapter unittest | **2/2 passed** |
| `git diff --check` | passed |

`tests/test_browser_regression_registry.py` defines pytest-style functions and has no `__main__` entry point: running it directly (`python3 tests/test_browser_regression_registry.py`) exits 0 **without running any test**. Invoke its three `test_*` functions explicitly (the one-liner above, as the V1.8 and V1.9 ledgers do) to obtain the 3/3 result.

V1.7 release evidence (re-run 2026-10-07, before V1.8):

| Check | Result |
| --- | ---: |
| Complete Node suite | **251 passed, 0 failed, 0 skipped** |
| Final safety/recovery focused sets | **85 + 30 passed, 0 failed, 0 skipped** |
| Focused Task 6 polish file | **4 passed, 0 failed, 0 skipped** |
| JavaScript syntax | **52 files passed** |
| Python AST parsing | **19 files passed** |
| Static browser contracts | **10/10 passed** |
| Browser-regression registry contracts | **3/3 passed** |
| Browser-path adapter unittest | **2/2 passed** |
| `git diff --check` | passed |

`pytest` is not installed in either supplied Python environment, so `python3 -m pytest tests/test_browser_path_adapter.py -q` is unavailable. The adapter's direct unittest entry point is the verified fallback. Do not report pytest as passed.

## Test scope

Node tests cover pure Core rules, migrations, storage/backup validation, Goal and Habit calculations, Calendar projections, Today projections, templates, Notes/Resources, recovery status and selected controller/adapter behavior. The V1.9 files add the fixes and `makeUuid` (`fixes`), release metadata and the report gate (`release`), backup reminder and persistence (`data-protection`), manifest/icons/meta (`install`), vendored assets and the service worker (`offline`), the i18n mechanism, catalog completeness and untranslated-text audit (`i18n`; since V1.9.1 also English fallbacks inside `${…}` expressions and `msg()`-only `validationResult:` literals), and Serbian Quick Add (`quick-add`). `tests/beta-v1-9-1.test.js` (V1.9.1) checks the version and report address, the About guide and report links, and the guide page `uputstvo.html` (Serbian Latin, headings, local-only references). `tests/quick-add-v1-10.test.js` (V1.10, 13 tests) checks `Core.parseQuickAdd` (clause and token tables in Serbian and English, order independence, one clause per kind, invalid and look-alike phrases, loose name matching, `parsePlan: false`, unchanged V1.5/V1.9 results), `createTask` precedence and Inbox placement in a VM slice, the preview markup, and a version of 1.10.0 or later. `tests/weekly-review-v1-11.test.js` (V1.11, 8 tests) checks `Core.deriveWeeklyReview` (every section, Sunday weeks, completed goals and archived habits left out), the review log (sanitizing, record, replace, cap 26), the due window, the backup round trip and the rejection of an invalid `weeklyReviews` (by editing a valid ZIP), the page sections, empty and done states, the app wiring (route, sidebar, "Još" menu, Today notice, completion action), `index.html`/`sw.js` loading and a version of 1.11.0 or later; since V1.11 `tests/i18n-v1-9.test.js` also requires a Latin-only catalog (12 tests in that file). `tests/time-blocking-v1-12.test.js` (V1.12, 10 tests) checks `Core.daySchedule` (blocks, estimates, open-only conflicts, unscheduled order, range), `Core.dayLoad`, the capacity default/validation and backup rejection, the day view (switch, capacity bar and over state, unscheduled inputs, grid rows, block geometry and classes, empty day, capacity off), `ui.calendarView` normalization and one-day navigation, the Today capacity item, the Settings select, the Quick Add chip and its precedence, and (since V2.0-a) a version of 1.12 or later. `tests/sync-v2-0a.test.js` (V2.0-a, 12 tests) checks the sync core against `tests/support/fake-supabase.js`: record collection, diff and apply, OTP sign-in and refresh, two-device convergence, last write wins with server history, habit-log convergence, the first-sync modes (including the newer-`updatedAt` merge), expired sessions, paging, offline errors, account deletion and static SQL checks. `tests/sync-app-v2-0a.test.js` (V2.0-a, 14 tests) checks script order and precache, the config guard against secret keys, the Settings card states and privacy note, the app sync block in a VM (waiting conditions, push and apply, deferral, failed save, sign-in with the same or another account, expired session, first-sync choice and snapshot, sign-out, account deletion with the typed word, fresh start after reset or restore), the wiring, the forced snapshot, the text-save timer fix and the exact version `2.0.0-alpha.1`. Two older tests (`tests/tasks-today-v1-5.test.js`, `tests/tasks-today-v1-6.test.js`) stub `weeklyReviewNotice` and `todayCapacityItem` because they slice `renderToday()`; their assertions are unchanged. Since V2.0-a, `tests/final-integration-v1-5.test.js` stubs `startSync` (it slices `init`) and `tests/tasks-today-v1-5.test.js` stubs `scheduleSync` (it slices `saveState`).

Release version convention (since V1.10): only the newest release test pins the exact `APP_VERSION` and `sw.js` `VERSION` (now `tests/sync-app-v2-0a.test.js`: `2.0.0-alpha.1`). Older release tests require "this version or later": `tests/release-v1-9.test.js` V1.9 (and accepts a pre-release suffix such as `-alpha.1`), `tests/beta-v1-9-1.test.js` 1.9.1, `tests/quick-add-v1-10.test.js` 1.10.0, `tests/weekly-review-v1-11.test.js` 1.11.0 and `tests/time-blocking-v1-12.test.js` 1.12; the V1.9.1–V1.12 tests and `tests/offline-v1-9.test.js` also check that `sw.js` follows `APP_VERSION`. A new release moves the exact pin into its own test.

Node runs in English: only `tests/i18n-v1-9.test.js` loads `js/i18n-sr.js` to assert Serbian output (each test file runs in its own process), and VM sandboxes get the English `I18n` from `tests/support/i18n.js`. Several tests use VM contexts, memory storage doubles or static source/CSS assertions. They are valuable regression checks but do not prove native browser persistence or visual layout.

`tests/ui-*.py` contains browser scenarios. `tests/browser_test_support/` contains the test-only adapter. `tests/run-browser-regressions.py --dry-run` lists the maintained groups and runs only static entries; it never launches a browser. The optional historical harness requires the pinned dependency in `requirements-browser-tests.txt`; it is not run as part of this release verification.

### Python browser scenarios

The Playwright scenarios in `tests/ui-*.py` select elements by English text, so they are out of date for the V1.9 Serbian UI and would fail on text selectors in a browser. They are not part of release verification. Their static contracts still pass: `tests/ui-v1-6-knowledge.py` was updated in V1.9 to match the `tr(…)` source and the per-type `msg(…)` Undo messages. Update the scenarios before relying on browser automation again.

## Browser acceptance policy

No isolated Chromium was launched for the V1.7 release, the V1.8 visual redesign, V1.9, V1.9.1, V1.10, V1.11 or V1.12. The user's personal Chrome was not opened or modified. iPhone results are recorded only from the user's own report: B1–B5 of `docs/beta/provera-pre-bete.md` passed on 2026-10-08 (table in `docs/superpowers/progress-v1-9.md`); B6 (update notice) to B30 are **manual-pending**, including B25–B30 for V1.10–V1.12 (Quick Add syntax and preview, the "Trajanje" chip, the weekly review, the Calendar day view with time inputs and conflicts, daily capacity, drag on Mac). Native browser acceptance remains **manual-pending**: real reload persistence, IndexedDB behavior, attachment chooser interactions, focus/keyboard behavior, responsive layout and mobile gestures must be checked in a user-owned browser when desired.

## Distributable ZIP

Current artifact (V1.12, 2026-10-08; closes roadmap Phase 4):

```text
Dailo-v1.12-distributable.zip
SHA-256: recorded only in the adjacent `Dailo-v1.12-distributable.zip.sha256` sidecar (`sha256sum -c` format)
Source: the commit that contains the V1.11/V1.12 docs sync; the ZIP and sidecar are added in the next commit
Archive entries: 85 regular files, no directory entries (dry run, 2026-10-08)
Archive validation: `unzip -t` passed (dry run)
```

V1.10 and V1.11 have no ZIP of their own; this package carries V1.10–V1.12. The layout is the V1.9.1 package plus `js/review-ui.js` (already matched by `js/*.js`) and the V1.10, V1.11 and V1.12 specs, plans and ledgers. Tests stay excluded, and so does the V2.0 draft spec (`docs/superpowers/specs/2026-10-08-todo-v2-0-design.md`, not approved).

Build (reproducible: the archive is made from a commit, file times are that commit's time, entries are sorted and zip extra fields are omitted). `git archive` packages committed files only. `SRC=HEAD` when packaging freshly committed docs/source; to re-verify the published package, use the parent of the commit that added it, `SRC=$(git rev-list -1 HEAD -- Dailo-v1.12-distributable.zip)^`.

```bash
SRC=HEAD
OUT="$PWD/Dailo-v1.12-distributable.zip"; STAGE=$(mktemp -d); rm -f "$OUT"
git archive "$SRC" -- .gitignore AGENTS.md CLAUDE.md PROJECT_OVERVIEW.md README.md index.html uputstvo.html \
  manifest.webmanifest sw.js requirements-browser-tests.txt css/styles.css 'js/*.js' vendor/jszip.min.js \
  'vendor/fonts/*' 'vendor/phosphor/*' 'icons/*' tools/generate-icons.py \
  'docs/claude/*.md' 'docs/codex/*.md' 'docs/beta/*.md' \
  docs/superpowers/specs/2026-09-22-todo-v1-7-design.md docs/superpowers/plans/2026-09-22-todo-v1-7.md \
  docs/superpowers/progress-v1-7.md docs/superpowers/specs/2026-10-07-todo-v1-8-design.md \
  docs/superpowers/plans/2026-10-07-todo-v1-8.md docs/superpowers/progress-v1-8.md \
  docs/superpowers/specs/2026-10-07-todo-v1-9-design.md docs/superpowers/plans/2026-10-07-todo-v1-9.md \
  docs/superpowers/progress-v1-9.md docs/superpowers/specs/2026-10-08-todo-v1-10-design.md \
  docs/superpowers/plans/2026-10-08-todo-v1-10.md docs/superpowers/progress-v1-10.md \
  docs/superpowers/specs/2026-10-08-todo-v1-11-design.md docs/superpowers/plans/2026-10-08-todo-v1-11.md \
  docs/superpowers/progress-v1-11.md docs/superpowers/specs/2026-10-08-todo-v1-12-design.md \
  docs/superpowers/plans/2026-10-08-todo-v1-12.md docs/superpowers/progress-v1-12.md \
  docs/superpowers/plans/2026-10-07-release-roadmap.md | tar -x -C "$STAGE"
(cd "$STAGE" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | TZ=UTC zip -X -D -q "$OUT" -@)
unzip -t "$OUT" && sha256sum Dailo-v1.12-distributable.zip > Dailo-v1.12-distributable.zip.sha256
```

- `vendor/jszip.min.js` is named explicitly; git pathspecs let `*` cross `/`, so `vendor/*.js` would also match future nested scripts.
- Dry run (2026-10-08): the working tree with the uncommitted V1.11/V1.12 docs was written to a temporary copy of the index (`GIT_INDEX_FILE`, `git add -A`, `git write-tree`), so the real index stayed untouched, and the recipe ran on that tree into a scratch directory outside the repository. Result: **85 regular files** (V1.9.1's 75 plus 10: `js/review-ui.js` and the nine V1.10–V1.12 spec, plan and ledger files), no directory entries, `unzip -t` passed. All 39 files of the `sw.js` precache list are in the archive. Offline start of the unzipped folder has not been tried in a browser (manual-pending).
- The SHA-256 lives only in the sidecar so the packaged ledger and guides stay byte-identical to the release artifact. The packaged docs are a snapshot of the source commit; later documentation edits are not in the ZIP until a new package is built.

### V1.9.1 package (previous artifact)

```text
Dailo-v1.9.1-distributable.zip
SHA-256: recorded only in the adjacent `Dailo-v1.9.1-distributable.zip.sha256` sidecar (`sha256sum -c` format)
Source: the commit that contains the V1.9.1 docs; the ZIP and sidecar were added in the next commit
Archive entries: 75 regular files, no directory entries (dry run, 2026-10-08)
Archive validation: `unzip -t` passed (dry run)
```

V1.9.0 was never packaged; V1.9.1 is the V1.9 release artifact. The layout is the V1.8 package plus the V1.9 runtime files and assets (`js/release.js`, `js/i18n.js`, `js/i18n-sr.js`, `manifest.webmanifest`, `sw.js`, `vendor/fonts/*` and `vendor/phosphor/*` with their license files, `icons/*`), `tools/generate-icons.py`, the V1.9 spec, plan and ledger, the release roadmap, the guide page `uputstvo.html` and the Serbian beta checklist `docs/beta/*.md`. Its recipe is the V1.12 recipe above without the six V1.10–V1.12 spec/plan files and three ledgers, with the output named `Dailo-v1.9.1-distributable.zip`; to re-verify it, use `SRC=$(git rev-list -1 HEAD -- Dailo-v1.9.1-distributable.zip)^`. Its dry run counted 75 regular files, with all 38 files of the V1.9.1 precache list in the archive.

### V1.8 package (older artifact)

```text
Dailo-v1.8-distributable.zip
SHA-256: recorded in the adjacent `Dailo-v1.8-distributable.zip.sha256` sidecar (`sha256sum -c` format)
Archive entries: 46 regular files, no directory entries
Archive validation: `unzip -t` passed with no errors; extracted files are byte-identical to the source commit
```

The V1.8 package is the V1.7 package layout (42 files) plus `docs/claude/CONTINUATION.md` and the V1.8 spec, plan and progress ledger. It excludes tests, `.superpowers/` review logs, worktree metadata, virtual environments, caches and other ZIPs. Behavior is the V1.7 baseline; V1.8 changes presentation only.

Build (reproducible: the archive is made from a commit, file times are that commit's time, entries are sorted and zip extra fields are omitted). `SRC=HEAD` when packaging freshly committed docs/source; to re-verify a published package, use the parent of the commit that added it, `SRC=$(git rev-list -1 HEAD -- Dailo-v1.8-distributable.zip)^`.

```bash
OUT="$PWD/Dailo-v1.8-distributable.zip"; STAGE=$(mktemp -d); rm -f "$OUT"
git archive "$SRC" -- .gitignore AGENTS.md CLAUDE.md PROJECT_OVERVIEW.md README.md index.html \
  requirements-browser-tests.txt css/styles.css 'js/*.js' vendor/jszip.min.js \
  'docs/claude/*.md' 'docs/codex/*.md' \
  docs/superpowers/specs/2026-09-22-todo-v1-7-design.md docs/superpowers/plans/2026-09-22-todo-v1-7.md \
  docs/superpowers/progress-v1-7.md docs/superpowers/specs/2026-10-07-todo-v1-8-design.md \
  docs/superpowers/plans/2026-10-07-todo-v1-8.md docs/superpowers/progress-v1-8.md | tar -x -C "$STAGE"
(cd "$STAGE" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | TZ=UTC zip -X -D -q "$OUT" -@)
unzip -t "$OUT" && sha256sum Dailo-v1.8-distributable.zip > Dailo-v1.8-distributable.zip.sha256
```

The SHA-256 lives only in the sidecar so the packaged ledger and guides stay byte-identical to the release artifact. The packaged docs are a snapshot of the source commit; later documentation edits on `main` (such as the branch notes after the 2026-10-07 merge) are not in the ZIP until a new package is built.

Older artifact: `Dailo-v1.7-distributable.zip` (42 regular files, `unzip -t` passed, SHA-256 in `Dailo-v1.7-distributable.zip.sha256`) remains in the repository as the V1.7 release.

## Acceptance checklist boundary

`docs/codex/ACCEPTANCE.md` contains **126** historical human/browser checklist items; **0** are marked checked in the file. Automated source and Node evidence above does not turn those items green. Native browser acceptance remains **manual-pending** for the user-owned browser, including real reload/IndexedDB persistence, file chooser/download behavior, deletion Undo timing, reset/restore interaction, drag/drop, responsive layout, keyboard/focus traversal and mobile touch behavior.

## Honest status vocabulary

- **Green / automated-tested:** demonstrated by a listed command.
- **Manual-pending:** needs a real browser/device interaction not performed here.
- **Deferred:** intentionally outside scope, such as backend accounts, cloud sync (the V2.0 draft spec is not approved), push notifications, external calendar sync, AI planning, a multi-day hourly calendar grid, comments/collaboration and bulk actions.
