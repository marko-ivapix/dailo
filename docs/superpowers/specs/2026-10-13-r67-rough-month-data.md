# R67 — the rough month of a task (data model)

**Date:** 2026-10-13 · **Status:** the data-model spec for R67. The user kept shopping and learning lists with a month and no day ("mi se isto svidja datum da ima (neodredjen je) okviran datum") and chose a new field over a planned date on the 1st ("okvirni datum opcija 2"). · **Release:** `2.0.0-alpha.94`.

## The field

`task.plannedMonth` is the month the user roughly means to do the task, shown as "Okvirno".

| Value | Meaning |
| --- | --- |
| missing or `null` | no rough month |
| `"YYYY-MM"`, month `01`–`12` | the rough month |

- **Independent of the dates.**
  - `plannedDate` and `dueDate` keep their meaning and are unchanged.
  - A task with a planned day shows that day, not its month. The month is shown only while there is no planned day.
- **Not on Today.** The month never makes a task overdue, planned, a suggestion or a reminder.
- **Upcoming.** `Core.deriveRoughMonths(tasks, today)` returns `{ month, items }` groups:
  - It takes the open tasks that have a valid month and no planned day.
  - It sorts the groups by month, and sorts the items by month, then title.
  - A month already past is listed under the current month, so it does not drop out of sight.
  - An optional `dueShownUntil` leaves out tasks due after today up to that day. Upcoming passes today + 21 days, because it already lists those tasks on their due day (review fix).
- **Helpers in Core:**
  - `normalizePlannedMonth(value)` returns the month or `null`;
  - `monthKey(date)` gives the month of a day;
  - `addMonths(month, n)` adds `n` months;
  - `upcomingMonth(number, today)` gives the next time a calendar month (1–12) comes round. The current month counts.

## Storage, backups and sync

- **Core:**
  - `Core.normalizeState` clears a stored invalid month to `null`.
  - It does not add the field to tasks that lack it. Older tasks stay byte-for-byte the same, so sync has nothing new to send after the update.
  - `validateStateV3` does not refuse a bad month, because normalizing repairs it first.
- **Backups:**
  - `Backup.validateDomain` refuses a task whose `plannedMonth` is set and is not a valid `YYYY-MM` (error `plannedMonth`).
  - Older backups have no field and validate unchanged.
  - Schema V3, IndexedDB v1 and ZIP `backupVersion: 2` are unchanged.
- **Sync:**
  - The month rides in the task record, which sync stores whole, like `durationMinutes`.
  - No migration is needed, and the field is not device-local.
- **Repeats and templates:**
  - The next occurrence of a repeating task starts without a month (`buildNextRecurringTask` sets `null`), because a repeat already has its own day.
  - Templates do not keep the month: `templateFromEntity` picks its task fields by name, and the month is not among them.
- **Inbox:** choosing a month in the task window takes the task out of Inbox, as choosing a day does. Removing the month leaves the Inbox marker alone.

## Older versions

- **Older app on another device:**
  - It keeps the unknown field. Its edits assign changes onto the task, and its backup validation ignores unknown fields.
  - It does not show the month.
- **Beta devices** update through the service worker.

## Tests (written first)

`tests/own-examples-r67.test.js` checks:

- the helpers and normalization;
- that older tasks are not rewritten;
- backup acceptance and refusal;
- the Upcoming grouping, and that the month stays off Today;
- the repeat and template behavior;
- the sync record.
