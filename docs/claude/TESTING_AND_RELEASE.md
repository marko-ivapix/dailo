# Testing and release guide

This document records the current verification path. It does not turn source inspection into browser acceptance.

## Run the local automated suite

From the prototype worktree:

```bash
node --test tests/*.test.js
for file in js/*.js vendor/*.js tests/*.js; do node --check "$file"; done
python3 - <<'PY'
import ast, pathlib
paths = sorted(pathlib.Path('tests').glob('*.py'))
for path in paths:
    ast.parse(path.read_text())
print(f'python AST: {len(paths)} files passed')
PY
./.venv/bin/python tests/test_browser_path_adapter.py
./.venv/bin/python tests/test_browser_regression_registry.py
python3 tests/run-browser-regressions.py --dry-run
git diff --check
```

Current V1.8 working-tree evidence (2026-10-07, after the visual redesign; see `docs/superpowers/progress-v1-8.md`):

| Check | Result |
| --- | ---: |
| Complete Node suite | **288 passed, 0 failed, 0 skipped** (includes 37 V1.8 design contracts in `tests/design-v1-8.test.js`) |
| JavaScript syntax | **53 files passed** |
| Python AST parsing | **19 files passed** |
| Static browser contracts | **10/10 passed** |
| Browser-regression registry contracts | **3/3 passed** (functions invoked explicitly) |
| Browser-path adapter unittest | **2/2 passed** |
| `git diff --check` | passed |

`tests/test_browser_regression_registry.py` defines pytest-style functions and has no `__main__` entry point: `./.venv/bin/python tests/test_browser_regression_registry.py` exits 0 **without running any test**. Invoke its three `test_*` functions explicitly (as the V1.8 ledger does) to obtain the 3/3 result.

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

Node tests cover pure Core rules, migrations, storage/backup validation, Goal and Habit calculations, Calendar projections, Today projections, templates, Notes/Resources, recovery status and selected controller/adapter behavior. Several tests use VM contexts, memory storage doubles or static source/CSS assertions. They are valuable regression checks but do not prove native browser persistence or visual layout.

`tests/ui-*.py` contains browser scenarios. `tests/browser_test_support/` contains the test-only adapter. `tests/run-browser-regressions.py --dry-run` lists the maintained groups and runs only static entries; it never launches a browser. The optional historical harness requires the pinned dependency in `requirements-browser-tests.txt`; it is not run as part of this release verification.

## Browser acceptance policy

No isolated Chromium was launched for the V1.7 release or the V1.8 visual redesign. The user's personal Chrome was not opened or modified. Native browser acceptance remains **manual-pending**: real reload persistence, IndexedDB behavior, attachment chooser interactions, focus/keyboard behavior, responsive layout and mobile gestures must be checked in a user-owned browser when desired.

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

The SHA-256 lives only in the sidecar so the packaged ledger and guides stay byte-identical to the release artifact.

Previous artifact: `Dailo-v1.7-distributable.zip` (42 regular files, `unzip -t` passed, SHA-256 in `Dailo-v1.7-distributable.zip.sha256`) remains in the repository as the V1.7 release.

## Acceptance checklist boundary

`docs/codex/ACCEPTANCE.md` contains **126** historical human/browser checklist items; **0** are marked checked in the file. Automated source and Node evidence above does not turn those items green. Native browser acceptance remains **manual-pending** for the user-owned browser, including real reload/IndexedDB persistence, file chooser/download behavior, deletion Undo timing, reset/restore interaction, drag/drop, responsive layout, keyboard/focus traversal and mobile touch behavior.

## Honest status vocabulary

- **Green / automated-tested:** demonstrated by a listed command.
- **Manual-pending:** needs a real browser/device interaction not performed here.
- **Deferred:** intentionally outside scope, such as backend accounts, cloud sync, external calendar sync, AI planning, hourly calendar grid, comments/collaboration and bulk actions.
