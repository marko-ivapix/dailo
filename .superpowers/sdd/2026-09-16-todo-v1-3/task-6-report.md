# Task 6 — Habits scheduling, logs, streaks, reminders, and history

## RED evidence

The new pure Habit contract was written before the implementation and run with:

```text
node --test tests/core-v1-3.test.js
```

Result: 22 passes and 5 expected failures. The failures were missing public APIs:

```text
TypeError: Core.habitScheduledOn is not a function
TypeError: Core.deriveHabitMetrics is not a function
TypeError: Core.numericHabitState is not a function
TypeError: Core.habitReminderActive is not a function
```

The browser contract was also added before the UI work. Its first local attempt was blocked before a page opened by the macOS sandbox's Chromium rendezvous-port restriction; the final test uses only Playwright's isolated headless Chromium with an explicit `finally: browser.close()`.

## Delivered behavior

- Added pure schedule, period, check-in status, numeric state, metrics/streak, and reminder-eligibility helpers to `TodoCore`.
- Supports daily, selected-weekday, X-times-per-week, and every-N-day Habits. Weekly streaks are successful weeks; extra weekly check-ins remain counted while reminders suppress at target.
- Added `#habits` and `#habit/<id>`, checkbox and numeric create/edit/check-in flows, advanced start/continuation/end/reminder controls, direct Goal links, status lifecycle, snooze actions, detail metrics, heatmap, editable history, and confirmation/Undo delete restoring logs and Goal links.
- Persists Habit logs exclusively through `TodoStorage.habitLogs`; derived caches are deliberately excluded from localStorage.
- Kept Goal progress updates through the existing shared Goal evaluator and did not alter V1.2 Search behavior or add bulk UI.

## GREEN evidence

```text
node --test tests/core.test.js tests/core-v1-3.test.js tests/storage-v1-3.test.js
```

Result: 49 passes, 0 failures.

```text
node --check js/core.js
node --check js/app.js
git diff --check
```

Result: all exited 0.

```text
.venv/bin/python tests/ui-v1-3-habits-calendar.py
```

Result: exited 0 using the isolated Playwright Chromium test browser. Coverage includes checkbox and numeric flows, quick add/direct total/history edit, streak/weekly display, lifecycle, delete/Undo, heatmap, and direct Goal-link synchronization.

## Changed files

- `js/core.js`
- `js/app.js`
- `css/styles.css`
- `tests/core-v1-3.test.js`
- `tests/ui-v1-3-habits-calendar.py`
- `docs/codex/TASKS.md`

## Concerns

Calendar composition remains Task 8's scope. The browser test intentionally launches only Playwright's disposable Chromium profile; it does not use Google Chrome or a user profile.

## Controller covering V1.2 regression verification at `12a1797`

Command: `/Users/marko.radicevic/Documents/Dailo simple/todo-app-prototype-v1.3/.venv/bin/python tests/run-browser-regressions.py` (approved short-lived isolated browser execution).

Result: exit code 0, no stdout/stderr warnings or errors. The tracked runner invokes `ui-v1-1-smoke.py`, `ui-v1-2-smoke.py`, and `ui-v1-2-lifecycle.py` with `check=True` sequentially. All 3 browser regression scripts passed, 0 failed. This covering regression evidence does not resolve the Habit-specific findings from the independent Task 6 review.

## Fix round 1 — amended Habit contracts

The following reviewer findings were reproduced as the open contract and are retained verbatim:

1. `js/core.js:355,397–404`; `js/app.js:1952–1955`: historical scheduling depends on the Habit's *current* active status. Recomputing a paused or archived Habit therefore yields no periods and zero total check-ins/longest streak, despite preserved logs. No pause interval is recorded, so resuming instead generates missed occurrences for the paused days and breaks continuity. Persist pause boundaries and separate historical occurrence eligibility from current reminder/check-in eligibility; preserve metrics and skip paused required units on resume.

2. `js/core.js:423–426`: current streak is assigned only when a period key equals Today, and an unsuccessful current period explicitly returns zero. A selected-weekday Habit shows zero on an unscheduled Tuesday after a successful Monday; a skipped Wednesday also shows zero despite continuity; an unfinished new weekly period loses the preceding successful-week streak before it is missed. Preserve the running streak through skipped/unscheduled/pending current units and break it only when a required occurrence/closed period is missed.

3. `js/app.js:1944–1950,1232–1234,2323`: continuation/end behavior is a successful-check-in hook rather than a period-boundary workflow. `askEachPeriod` prompts immediately on current-period success and uses an Archive/Continue dialog with no Pause choice. Missed boundaries and date-end conditions produce no prompt without another valid check-in; after an end date a check-in is rejected at `js/app.js:1935`, so opening the app after expiry can never trigger the prompt. Continue only writes `lastContinuationPeriod`, leaving date/success-count/one-period conditions satisfied, so subsequent check-ins prompt again and one-period Habits are never converted to repeating. Evaluate boundaries/end conditions on startup and date transitions, implement the three Ask choices, and make Continue/Convert establish a valid next period or clear the reached condition.

4. `js/app.js:1904–1906,1198`: saving an existing Habit with More collapsed clears its end date, successful-period target, reminders, and Goal IDs because their DOM controls do not exist. Even opening More first calls the same reader, clearing those fields *before* displaying them. Preserve draft values when controls are absent and read only rendered fields. Retain reminder IDs/enabled values instead of rebuilding all reminders during unrelated edits.

5. `js/app.js:679,683,1935`: the history editor contains only existing logs and is capped at the latest 60, with no date picker, missing-occurrence rows, pagination, or way to create a past log. A missed unlogged day cannot be corrected to Done/Skipped even though the metrics count it as missed; older history also becomes inaccessible. The handler additionally disallows historical correction whenever the Habit is paused/archived. Provide precise past-date history editing, including unlogged dates and older entries, and validate historic eligibility independently of current lifecycle status.

6. `js/app.js:2725–2731`; `js/app.js:1892–1898`: a day/week transition renders without refreshing the cached metrics. An app left open across the week boundary keeps displaying the old `4/4` or `5/4` until another edit or reload, violating the required `0/target` reset. Startup also calls `checkReminders()` before its asynchronous log refresh resolves, allowing reminders for an already-completed weekly target against an empty cache. Await initial log hydration before reminder evaluation and refresh metrics before rendering/checking reminders on date changes.

7. `js/app.js:1962–1966,2242–2244`: snooze only suppresses reminders until a timestamp; it never schedules a new reminder or clears a fired moment. Snoozing an already-delivered reminder therefore produces no reminder at +15m/+1h/Tonight because its original moment remains in `reminderFiredMoments`. Record and consume a distinct pending snooze delivery while retaining weekly-target/paused suppression.

8. `js/app.js:654–656`: Numeric Habits always format current period as `currentPeriodCount / targetValue unit`, but metrics for `timesPerWeek` deliberately make `currentPeriodCount` the successful-day count. A numeric Habit requiring 2 L on 4 days/week shows `5 / 2 L` instead of weekly `5 / 4` after five successful days. Prefer the weekly frequency branch and keep today's numeric amount as a separate daily control/label.

### Fixes and verification

- Persisted pause starts and closed pause intervals, including historical scheduling independent of current active status. Historic log correction is now permitted for paused/archived Habits while live current-day check-ins remain lifecycle gated.
- Reworked metric streak return semantics so skipped/unscheduled/pending current units retain the running streak; required missed/closed weekly units break it.
- Added startup/date-boundary lifecycle evaluation and a boundary modal with Continue/Pause/Archive. Continue clears reached end conditions; one-period conversion changes continuation to automatic.
- More now reads only controls currently rendered and preserves absent advanced draft values, Goal links, reminder IDs, enabled state, and numeric quick-values as an array after a save/reload/remount. History has an exact past-date editor and no 60-row cap.
- Initial log hydration precedes both lifecycle/reminder work; day/week refresh hydrates before rendering/reminders. Snooze records and consumes a distinct pending delivery.
- The heatmap renders every calendar day for the current month. Deterministic Playwright time covers a 31-day month, `5 / 4` numeric weekly UI, historical correction, fired-then-snoozed delivery, and boundary continuation.

```text
RED: node --test tests/core-v1-3.test.js
Result before the fixes: 27 passes, 2 expected failures (paused historic totalCheckins was 0 not 3; carried streak was 0 not 1).

GREEN: node --test tests/core.test.js tests/core-v1-3.test.js tests/storage-v1-3.test.js
Result: 51 passes, 0 failures, 0 skipped.

.venv/bin/python tests/ui-v1-3-habits-calendar.py
Result: exit 0, no stdout/stderr. It launches disposable headless Playwright Chromium only and closes it in finally.

.venv/bin/python tests/run-browser-regressions.py
Result: exit 0, no stdout/stderr; 3 V1.2 browser scripts passed, 0 failed.

node --check js/core.js && node --check js/app.js && git diff --check
Result: exit 0.
```
