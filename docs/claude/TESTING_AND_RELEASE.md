# Testing and release guide

This document records the current verification path. It does not turn source inspection into browser acceptance.

## Run the local automated suite

From the repository root (branch `main`; until the V1.9 PR is merged, V1.9 is on `ccr-95f6062b-lgg2fr`):

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

Current V1.9 evidence (2026-10-07, after Step 6; see `docs/superpowers/progress-v1-9.md`). The same results were reproduced when these docs were synchronized:

| Check | Result |
| --- | ---: |
| Complete Node suite | **330 tests: 329 passed, 0 failed, 1 todo** (288 from V1.8 plus 42 in seven `tests/*-v1-9.test.js` files). The todo is the release gate in `tests/release-v1-9.test.js`, waiting for the problem-report address. |
| JavaScript syntax | **63 files passed** (`js/*.js vendor/*.js tests/*.js`) plus `tests/support/i18n.js` and `sw.js` |
| Python AST parsing | **19 files passed** (`tests/*.py`) |
| Static browser contracts | **10/10 passed** (`--dry-run`) |
| Browser-regression registry contracts | **3/3 passed** (functions invoked explicitly) |
| Browser-path adapter unittest | **2/2 passed** |
| `git diff --check` | passed |

When `REPORT_EMAIL` is set, the release gate becomes a real assertion and the expected Node result is 330 passed, 0 failed, 0 todo.

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

Node tests cover pure Core rules, migrations, storage/backup validation, Goal and Habit calculations, Calendar projections, Today projections, templates, Notes/Resources, recovery status and selected controller/adapter behavior. The V1.9 files add the fixes and `makeUuid` (`fixes`), release metadata and the report gate (`release`), backup reminder and persistence (`data-protection`), manifest/icons/meta (`install`), vendored assets and the service worker (`offline`), the i18n mechanism, catalog completeness and untranslated-text audit (`i18n`), and Serbian Quick Add (`quick-add`). Node runs in English: only `tests/i18n-v1-9.test.js` loads `js/i18n-sr.js` to assert Serbian output (each test file runs in its own process), and VM sandboxes get the English `I18n` from `tests/support/i18n.js`. Several tests use VM contexts, memory storage doubles or static source/CSS assertions. They are valuable regression checks but do not prove native browser persistence or visual layout.

`tests/ui-*.py` contains browser scenarios. `tests/browser_test_support/` contains the test-only adapter. `tests/run-browser-regressions.py --dry-run` lists the maintained groups and runs only static entries; it never launches a browser. The optional historical harness requires the pinned dependency in `requirements-browser-tests.txt`; it is not run as part of this release verification.

### Python browser scenarios

The Playwright scenarios in `tests/ui-*.py` select elements by English text, so they are out of date for the V1.9 Serbian UI and would fail on text selectors in a browser. They are not part of release verification. Their static contracts still pass: `tests/ui-v1-6-knowledge.py` was updated in V1.9 to match the `tr(…)` source and the per-type `msg(…)` Undo messages. Update the scenarios before relying on browser automation again.

## Browser acceptance policy

No isolated Chromium was launched for the V1.7 release, the V1.8 visual redesign or V1.9. The user's personal Chrome was not opened or modified. The V1.9 iPhone checklist (spec "Acceptance") is recorded only from the user's own report and is **manual-pending**. Native browser acceptance remains **manual-pending**: real reload persistence, IndexedDB behavior, attachment chooser interactions, focus/keyboard behavior, responsive layout and mobile gestures must be checked in a user-owned browser when desired.

## Distributable ZIP

Current artifact (V1.8, packaged 2026-10-07):

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

### V1.9 package (recipe ready, not yet built)

`Dailo-v1.9-distributable.zip` is built in plan Step 7, after `REPORT_EMAIL` is set and the V1.9 docs and source are committed. `git archive` packages committed files only. The layout is the V1.8 package plus the V1.9 runtime files and assets (`js/release.js`, `js/i18n.js`, `js/i18n-sr.js`, `manifest.webmanifest`, `sw.js`, `vendor/fonts/*` and `vendor/phosphor/*` with their license files, `icons/*`), `tools/generate-icons.py`, the V1.9 spec, plan and ledger, and the release roadmap. Tests stay excluded.

```bash
SRC=HEAD
OUT="$PWD/Dailo-v1.9-distributable.zip"; STAGE=$(mktemp -d); rm -f "$OUT"
git archive "$SRC" -- .gitignore AGENTS.md CLAUDE.md PROJECT_OVERVIEW.md README.md index.html \
  manifest.webmanifest sw.js requirements-browser-tests.txt css/styles.css 'js/*.js' vendor/jszip.min.js \
  'vendor/fonts/*' 'vendor/phosphor/*' 'icons/*' tools/generate-icons.py \
  'docs/claude/*.md' 'docs/codex/*.md' \
  docs/superpowers/specs/2026-09-22-todo-v1-7-design.md docs/superpowers/plans/2026-09-22-todo-v1-7.md \
  docs/superpowers/progress-v1-7.md docs/superpowers/specs/2026-10-07-todo-v1-8-design.md \
  docs/superpowers/plans/2026-10-07-todo-v1-8.md docs/superpowers/progress-v1-8.md \
  docs/superpowers/specs/2026-10-07-todo-v1-9-design.md docs/superpowers/plans/2026-10-07-todo-v1-9.md \
  docs/superpowers/progress-v1-9.md docs/superpowers/plans/2026-10-07-release-roadmap.md | tar -x -C "$STAGE"
(cd "$STAGE" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | TZ=UTC zip -X -D -q "$OUT" -@)
unzip -t "$OUT" && sha256sum Dailo-v1.9-distributable.zip > Dailo-v1.9-distributable.zip.sha256
```

- `vendor/jszip.min.js` is named explicitly; git pathspecs let `*` cross `/`, so `vendor/*.js` would also match future nested scripts.
- Dry run (2026-10-07, `SRC=HEAD` at `22f9625`, output in a scratch directory outside the repository): **73 regular files** (V1.8's 46 plus 27), no directory entries, `unzip -t` passed. Every file in the `sw.js` precache list is in the archive. Offline start of the unzipped folder has not been tried in a browser (manual-pending).
- Record the final file count and the SHA-256 sidecar in `docs/superpowers/progress-v1-9.md` when the package is built. To re-verify it later, use `SRC=$(git rev-list -1 HEAD -- Dailo-v1.9-distributable.zip)^`.

Previous artifact: `Dailo-v1.7-distributable.zip` (42 regular files, `unzip -t` passed, SHA-256 in `Dailo-v1.7-distributable.zip.sha256`) remains in the repository as the V1.7 release.

## Acceptance checklist boundary

`docs/codex/ACCEPTANCE.md` contains **126** historical human/browser checklist items; **0** are marked checked in the file. Automated source and Node evidence above does not turn those items green. Native browser acceptance remains **manual-pending** for the user-owned browser, including real reload/IndexedDB persistence, file chooser/download behavior, deletion Undo timing, reset/restore interaction, drag/drop, responsive layout, keyboard/focus traversal and mobile touch behavior.

## Honest status vocabulary

- **Green / automated-tested:** demonstrated by a listed command.
- **Manual-pending:** needs a real browser/device interaction not performed here.
- **Deferred:** intentionally outside scope, such as backend accounts, cloud sync, push notifications, external calendar sync, AI planning, hourly calendar grid, comments/collaboration and bulk actions.
