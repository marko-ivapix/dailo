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
