# Task 2 — Tasks 2.0 and Today Focus

Implemented optional duration in Task Properties, persisted daily focus selections capped at three open tasks, inline Today completion/planning/focus controls, and Daily Review counts with remaining planned duration. Live app loading (including fresh sample workspaces) and persisted saves consume the shared V1.5 normalizer; saves keep live entity references intact.

Quick Add accepts valid trailing date/time phrases (`tomorrow 09:30`, `Monday at 10:00`, or a trailing time). Explicit date picker values preserve previous title semantics and override parsed dates. Optional explicit planned/due time fields live under More; explicit planned time, including clearing it, overrides parsed time. Existing lifecycle, Search, recurrence edit scope and one-level subtasks remain intact.

## Evidence

- Parser test observed red before implementation, then green.
- `node --test tests/*.test.js`: **100 passed, 0 failed**.
- Deterministic rendering tests verify Today focus cap, duration metadata, inline actions and actual Daily Review task counts.
- JavaScript syntax checks and `git diff --check`: passed.
- Focused browser acceptance updated to exercise duration, focus, inline completion, review, date parsing and explicit date/time precedence.
- Browser execution is **not verified**: system/bundled Python lack Playwright; repo `.venv/bin/python` has Playwright, but sandboxed headless Chromium aborts with `TargetClosedError` / `SIGABRT` at launch. An elevated launch request was interrupted before running. Root should run `PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-5.py` with an approved runtime.

No personal browser or user profile was used.
