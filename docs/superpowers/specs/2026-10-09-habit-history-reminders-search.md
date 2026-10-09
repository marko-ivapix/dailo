# M11 — habit history, reminders after check-in, Search speed (design)

**Date:** 2026-10-09 · **Status:** approved by the user's answers to the audit's open questions (section 10 of `2026-10-09-modernization-capacitor-audit.md`): "1. samo od promene 2. ne 3. može". · **Release:** `2.0.0-alpha.3` on `feature/capacitor-modernization`.

## D1 — a weekly target or week-start change applies only from the change on (H-1)

Today a change of "X times per week" or of the week start regroups and re-scores every past week. From now on completed weeks keep the target and the boundaries they had.

**Weekly target.**

- New optional habit field `targetHistory`: `[{ before: 'YYYY-MM-DD', timesPerWeek: 1–7 }]`, sorted by `before`, one entry per `before`, at most 104 kept. An entry says "weeks whose period key is earlier than `before` had this target".
- `Core.recordHabitTargetChange(habit, next, weekStart)` returns the new list (pure). It adds `{ before: weekStart, timesPerWeek: previous }` only when the habit was weekly before and after the edit and the number changed. A second change in the same week keeps the first entry, so the week before still has its original target.
- `Core.habitTargetFor(habit, periodKey)` gives the target of one period. `deriveHabitMetrics`, `habitCompletionForDates` and `habitAnalytics` use it per period; `currentPeriodTarget` is the current target.
- Both habit save paths (the habit dialog and the Frequency panel) record the change with the current week's key.

**Week start.**

- New optional setting `weekStartHistory`: `[{ before, weekStartsOn: 'monday'|'sunday', changedOn }]`, at most 52 kept. `before` is the start of the week in which the change was made, counted with the old week start; dates before it keep the old grouping.
- `Core.recordWeekStartChange(settings, next, today)` returns the new list. A change back within seven days of the previous change removes that change instead of adding one.
- `Core.habitWeekRule(settings)` gives `{ weekStartsOn, history }`; habit functions accept it wherever they accepted `'monday'`/`'sunday'` (a plain string still works and means "no history").
- `Core.habitPeriodKey` resolves a date with the rule in effect for it. The week that contains the change is cut at the boundary: a remaining piece of four or more days stays its own week (Monday → Sunday: a six-day week); a shorter piece joins the next week (Sunday → Monday: an eight-day week). Completed weeks never change.
- Only habit periods use the history. The Calendar, Today and the weekly review follow the current week start, as before.

**Data and compatibility.** Both fields are optional; data without them behaves exactly as before. Changes made before this version already rewrote history and cannot be reconstructed. Backups validate the shapes (`Invalid backup: targetHistory` / `weekStartHistory`); sync carries them inside the habit record and the shared settings record. Schema V3, IndexedDB v1 and ZIP `backupVersion: 2` are unchanged. Frequency-type changes (daily ↔ weekly) still regroup history as before (not part of the question).

## D2 — a habit's reminders stay silent once the day is checked in

When today's status of a habit is `done` or `skipped`, its reminders for today do not fire: `Core.habitReminderActive` returns false (in-app reminders and snoozes), and `Core.notificationPlan` leaves out today's moments (phone notifications). A check-in reconciles the phone plan through the existing `refreshHabitMetrics` hook, so pending notifications for today are cancelled. A numeric habit below its target still reminds. Weekly habits keep the existing rule (silent once the week's target is met).

## D3 — Search gets a debounce and a result cap

- Typing updates `modalState.query` at once; the result list is rebuilt 120 ms after the last keystroke (`SEARCH_DEBOUNCE_MS`).
- At most 50 tasks and 20 projects are rendered, in the unchanged order of `Core.searchItems`; when there are more, a note says "Showing {shown} of {count}. Type more to narrow the results."
- Scope, matching and ranking (`Core.searchItems`) are unchanged.

## Tests (written first)

`tests/decisions-m11.test.js`: target lookup and recording, metrics/analytics/completion per period, week-start recording and undo, period keys across both directions, metrics across a week-start change, backup validation, the two save paths and the settings save, the reminder silence (in-app and plan), the Search cap and debounce, and the pinned version `2.0.0-alpha.3`.
