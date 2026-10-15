# R88 — Repeat from the day it is done (data model)

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"; "N dana posle završetka" for household jobs). · **Release:** `2.0.0-alpha.115`. **Data-model change:** one optional field in a task's repeat rule. Schema V3, IndexedDB v1 and ZIP `backupVersion: 2` stay.

## The field

- `task.recurrence.afterCompletion` is a boolean, stored only when `true`. It is also kept in `recurrenceBaseline.recurrence` and in a template's `data.recurrence`.
  - **Absent:** the rule counts by the calendar, as before. Older rules stay exactly as they were.
  - **`true`:** the next occurrence is counted from the day the task is completed.
- **Only a plain interval** (daily, weekly, monthly or yearly, every N) can count from completion.
  - `Core.normalizeRecurrence` (and so `normalizeRecurrenceV3`) keeps `afterCompletion: true` and drops chosen weekdays and month days.
  - A `false` value is not stored.
  - `normalizeRecurrence` is now exported.

## The behavior

- **`Core.buildNextRecurringTask`:**
  - The next date is the completion's local day plus the interval. With "Preskoči sledeći put" it is two intervals.
  - That date is the next plan day. A task with only a deadline gets it as its deadline, and a task without dates gets it as its plan.
  - The deadline and the reminder keep their distance to the plan (or to the deadline), the reminder on the same wall-clock time.
- **`Core.calendarRepeats`:** such a rule projects no future dates in the calendar, because they are not known before the task is done.
- **Repeat editor:** after the interval, a choice "Sledeći put":
  - "Po rasporedu": "Dani su unapred određeni, i kad zakasniš."
  - "Od dana završetka": "Sledeći dolazi tek kad završiš ovaj."
  - With the second, the weekday, month-day and yearly blocks are hidden, and the note says "Sledeći se pravi kad završiš ovaj."
  - The sheet's rule always carries `afterCompletion: true/false`, so "Po rasporedu" clears an earlier `true` when it is merged into the stored rule; normalization drops the `false`.
  - The presets keep the choice.
- **The rule's sentence:** "{N} dan / dana / nedelju / nedelje / nedelja / mesec / meseca / meseci / godinu / godine / godina posle završetka", plus the end and status suffixes as before.
- **Redovne obaveze** use the same editor, so a chore can count from its last time.

## Storage, backup and sync

- **`normalizeState`:** goes through `normalizeRecurrenceV3` as before.
- **`js/backup.js` (`recurrenceDays`, also used for template repeat data):** `afterCompletion` must be a boolean, and `true` is refused next to `weekdays` or `monthMode` (`Invalid backup: afterCompletion`).
- **Sync:** the field travels inside the task record's `recurrence`; nothing else changes.

## Checks

- **Node:** `tests/repeat-after-completion-r88.test.js`, written first; it failed 8/8. It covers:
  - normalization;
  - the next occurrence: late, early, only a deadline, no dates, a skip, and the calendar rule unchanged;
  - the calendar projection;
  - backup and sync;
  - the editor;
  - the sentence and Serbian;
  - the guide;
  - the version.
- **Older tests updated (with comments):** `redesign-r11b` (×4) and `redesign-r11c` (the sheet's rule carries `afterCompletion: false`), and R87's version pin is now "or later".
- **Chromium:** see the ledger row.
- **Manual-pending:** the phone, and sync between two devices.
