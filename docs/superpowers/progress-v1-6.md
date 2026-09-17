# Dailo V1.6 Progress

## Task 1 — additive state defaults and migration guard

- Implemented `Core.normalizeV16Settings(settings)` with additive defaults for `todayFocusFilter`, `todayFocusStrip`, `compactDensity`, and missing `weekStartsOn`.
- Implemented idempotent `Core.migrateStateV16(state)` with cloned input, unknown-record preservation, and warnings output.
- Wired V1.6 migration into app startup normalization before the first rendered state and persisted changed V1.6 settings.
- Added focused Core and storage tests.

Evidence:

- Red: `node --test tests/storage-v1-6.test.js tests/core-v1-6.test.js` — 3 failed because the V1.6 interfaces were absent.
- Green: `node --test tests/storage-v1-6.test.js tests/core-v1-6.test.js tests/storage-v1-5.test.js` — 12 passed, 0 failed.
- Syntax: `node --check js/core.js` and `node --check js/app.js` passed.
- `git diff --check` passed.
- Full JavaScript regression: `node --test tests/*.test.js` — 151 passed, 0 failed.

## Task 10 — final compact polish and release verification

- Static inspection found that anchors opt into the shared tap-highlight treatment but were absent from the shared `:focus-visible` focus-ring selector. Added `a:focus-visible` to that exact selector; links now receive the existing electric-blue `--focus-ring` without changing density, touch-target dimensions, or semantic colors.
- Red: with `a:focus-visible` temporarily omitted, `node --test tests/compact-layout-v1-6.test.js` — **0 passed, 1 failed**. The assertion failed because the shared selector no longer matched a keyboard-focused link.
- Green: restored the minimal selector addition; `node --test tests/compact-layout-v1-6.test.js` — **1 passed, 0 failed**.
- Full Node suite: `node --test tests/*.test.js` — **187 passed, 0 failed, 0 skipped**.
- JavaScript syntax: `node --check` passed for **44** files under `js/`, `vendor/`, and `tests/`.
- Python checks: all **17** Python test files parsed with `ast.parse`. The required `python3 -m pytest tests/test_browser_path_adapter.py -q` could not run because neither the system Python nor the repository virtual environment includes `pytest`; the adapter's own non-browser `unittest` entry point passed **2/2** with `./.venv/bin/python tests/test_browser_path_adapter.py`.
- `git diff --check` passed.
- Native browser acceptance was not run. No browser was launched for this task; this environment's browser runtime remains unavailable for release-quality visual/accessibility sign-off.
- Packaging policy preserved from V1.5: include only `index.html`, README/overview, CSS, JavaScript, vendor assets, browser-test requirements, and user-relevant `docs/codex` and progress-ledger Markdown. Exclude Git metadata, tests, virtual environments/caches, plans/specs/review logs, nested ZIPs, and unsafe paths.
- V1.6 distributable: `/Users/marko.radicevic/Documents/Dailo simple/Dailo-v1.6-distributable.zip` contains **31 files** and `unzip -t` reported no errors. SHA-256: `fb73efa1269f25576c6afe3b341a3db18adce17adbb8ea207199c4cc6e2821e3`. The archive contains the pre-digest ledger copy so the artifact digest can be recorded in source without a self-referential package checksum.
