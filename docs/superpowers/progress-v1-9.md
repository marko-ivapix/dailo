# Dailo V1.9 Progress Ledger

**Baseline:** V1.8 on `main` (`5e4ba82`) plus the V1.9 spec/plan documents
**Spec:** `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md`
**Plan:** `docs/superpowers/plans/2026-10-07-todo-v1-9.md`

## Status

- [x] Spec approved by the user (2026-10-07)
- [x] Plan written
- [x] Step 1 — Fixes and UUID fallback
- [ ] Step 2 — Version and problem reports
- [ ] Step 3 — Data protection
- [ ] Step 4 — Install
- [ ] Step 5 — Offline
- [ ] Step 6 — Serbian localization
- [ ] Step 7 — Final verification and package

Open input: the e-mail address for problem reports (requested from the user).

## Baseline evidence (before V1.9 code changes)

Cloud session, Node v22.22.0, Python 3.13.16 (no `.venv`; system `python3`).

| Check | Result |
| --- | ---: |
| `node --test tests/*.test.js` | 288 passed, 0 failed, 0 skipped |
| JavaScript syntax (`js/*.js vendor/*.js tests/*.js`) | 53/53 |
| Python AST (`tests/*.py`) | 19/19 |
| `tests/test_browser_path_adapter.py` | 2/2 |
| `tests/test_browser_regression_registry.py` | 3/3 (functions invoked explicitly) |
| `tests/run-browser-regressions.py --dry-run` | 10/10 static contracts (2 + 3 + 5) |
| `git diff --check` | passed |

## Evidence log

_Step entries are appended below as each step completes._

**Step 1 — fixes and UUID fallback.** New `tests/fixes-v1-9.test.js` (6 tests, all failing before the change for the expected reasons):
- **G1:** a favorite Note/Resource rendered `ph ph-star-fill`, a class Phosphor web 2.1.1 does not define, so the star was blank. It now renders `ph-fill ph-star` (`js/knowledge.js`).
- **G2:** `Core.weekStartKey()` maps `0`/`'sunday'` to `'sunday'` and everything else to `'monday'`. `weekStartFor` and every caller (`js/app.js` ×3, `js/calendar-ui.js` ×2, `js/habits-ui.js` ×3) now go through it, so a stored `0` behaves as Sunday, matching the Settings select. Stored values and `normalizeV16Settings` are unchanged, so there is no data migration.
- **G3:** the disabled "Week starts on: Monday" placeholder is removed from Settings → General. The working control stays under Personalization.
- **D:** `Core.makeUuid()` uses `crypto.randomUUID`, else `crypto.getRandomValues` (RFC 4122 v4 bits), else `Math.random`. It is used by `splitRecurrenceForFuture` and the default `instantiateTemplate` id. A test removes `randomUUID` from `globalThis.crypto` to simulate an insecure context.

Checks: focused 6/6; full Node **294/294**; JavaScript syntax 54/54; `git diff --check` passed.
