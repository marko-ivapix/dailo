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
