# Testing and release guide

This document records the current verification path. It does not turn source inspection into browser acceptance.

## Run the local automated suite

From the prototype worktree:

```bash
node --test tests/*.test.js
for file in js/*.js vendor/*.js tests/*.js; do node --check "$file"; done
python3 - <<'PY'
import ast, pathlib
paths = sorted(pathlib.Path('tests').rglob('*.py'))
for path in paths:
    ast.parse(path.read_text())
print(f'python AST: {len(paths)} files passed')
PY
./.venv/bin/python tests/test_browser_path_adapter.py
git diff --check
```

Current V1.6 release evidence:

| Check | Result |
| --- | ---: |
| Complete Node suite | **195 passed, 0 failed, 0 skipped** |
| Focused backup/recovery set | **33 passed, 0 failed, 0 skipped** |
| Focused `recovery-v1-6` file | **11 passed, 0 failed, 0 skipped** |
| JavaScript syntax | **44 files passed** |
| Python AST parsing | **19 files passed** |
| Browser-path adapter unittest | **2/2 passed** |
| `git diff --check` | passed |

`pytest` is not installed in either supplied Python environment, so `python3 -m pytest tests/test_browser_path_adapter.py -q` is unavailable. The adapter's direct unittest entry point is the verified fallback. Do not report pytest as passed.

## Test scope

Node tests cover pure Core rules, migrations, storage/backup validation, Goal and Habit calculations, Calendar projections, Today projections, templates, Notes/Resources, recovery status and selected controller/adapter behavior. Several tests use VM contexts, memory storage doubles or static source/CSS assertions. They are valuable regression checks but do not prove native browser persistence or visual layout.

`tests/ui-*.py` contains browser scenarios. `tests/browser_test_support/` contains the test-only adapter. The optional historical harness requires the pinned dependencies in `requirements-browser-tests.txt`; it is not run as part of this release verification.

## Browser acceptance policy

No isolated Chromium was launched for the V1.6 release. The user's personal Chrome was not opened or modified. Native browser acceptance remains **manual-pending**: real reload persistence, IndexedDB behavior, attachment chooser interactions, focus/keyboard behavior, responsive layout and mobile gestures must be checked in a user-owned browser when desired.

## Distributable ZIP

Artifact:

```text
/Users/marko.radicevic/Documents/Dailo simple/Dailo-v1.6-distributable.zip
```

Release checks:

- 40 regular files, including `CLAUDE.md` and `docs/claude/` onboarding guides.
- `unzip -t` passes with no compressed-data errors.
- Runtime, CSS, vendor, README/overview and selected `docs/codex`/progress Markdown are included.
- Tests, `.git`, virtual environments, caches, plans/specs/review logs, nested ZIPs and unsafe paths are excluded.
- The packaged progress ledger contains an explicit post-build digest marker; the source ledger records the final SHA without a self-referential archive checksum.

SHA-256:

```text
ca9320071006c9f443633f2633da3d0aebc570dd7549ed40157452936e6856b0
```

## Honest status vocabulary

- **Green / automated-tested:** demonstrated by a listed command.
- **Manual-pending:** needs a real browser/device interaction not performed here.
- **Deferred:** intentionally outside scope, such as backend accounts, cloud sync, external calendar sync, AI planning, hourly calendar grid, comments/collaboration and bulk actions.
