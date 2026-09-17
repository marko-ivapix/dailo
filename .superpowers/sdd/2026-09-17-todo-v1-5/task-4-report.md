# Task 4 report — Calendar time-blocking

## Status

DONE with isolated-browser verification blocked by the local browser sandbox.

## Delivered

- Week and Day Detail derive timed Task blocks from `Core.getTimedTaskBlocks(state.tasks, date)`; no calendar event store was introduced.
- A timed block displays its start/end time and conflict state. All-day Tasks remain in the all-day region and Month remains count-only.
- Dropping a Calendar Task over a timed block changes `plannedDate` and `plannedTime` only. `durationMinutes` is intentionally untouched.
- Habits remain non-draggable.
- A Task with a same-day planned and due date remains one timed block and retains both `Plan` and `Due` metadata.

## TDD evidence

- Added focused browser assertions for timed end labels, same-day planned/due metadata on one entry, overlaps, all-day preservation, non-draggable Habits, timed drag/drop duration preservation, Day Detail conflict notice, and Month behavior in `tests/ui-v1-5.py`.
- The focused browser script could not reach the assertions in this environment: the required managed Chromium process aborts at launch under the sandbox. An escalated isolated-browser attempt was interrupted before it completed. No personal Google Chrome was opened.
- Added Node coverage ensuring all-day, completed, and other-date Tasks are excluded from timed block derivation.

## Verification

- `node --check js/calendar-ui.js && node --check js/app.js` — passed.
- `node --test tests/*.test.js` — 113 passed, 0 failed.
- `git diff --check` — passed.

## Limitation

Run `PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-5.py` in a permitted isolated browser runtime before release to execute the new rendered UI and drag/drop assertions.
