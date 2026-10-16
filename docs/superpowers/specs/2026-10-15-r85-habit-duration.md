# R85 — A habit's duration counts toward the day's capacity (data model)

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"; "Kapacitet bi računao i trajanje navika"). · **Release:** `2.0.0-alpha.112`.

## The field

`habit.durationMinutes` is how long a habit takes.

| Value | Meaning |
| --- | --- |
| missing or `null` | no duration (every habit before R85) |
| a whole number 1–1440 | minutes |

- **Helper:** `Core.habitDurationOrNull(value)`.
- **The habit window**, under "Više", has "Trajanje … min" (`#habit-duration`, number 1–1440, step 5).
  - Empty means no duration.
  - A value outside 1–1440 or not whole says "Trajanje mora biti od 1 do 1440 minuta." and saves nothing.
  - A habit that never had a duration gets no empty field, so sync has nothing new to send.

## The capacity

- **`Core.dayLoad(tasks, date, habits = [], logs = [])`** adds the habits that are:
  - active and planned that day (`habitScheduledOn`);
  - with days of their own, so not "X puta nedeljno", which has no day;
  - not done that day;
  - with a duration.
- **The result:** they count in `minutes` and `withDuration`. `habitMinutes` says how much is theirs and appears only when there is some. Without habits the result is unchanged.
- **Kalendar → Raspored:** the line says "Planirano X od Y, od toga navike Z" when habits count; otherwise it is unchanged. The week's load bars count them too.

## Storage, backups and sync

- **Core:** `normalizeState` clears a stored invalid duration to `null` and adds nothing to habits without one.
- **Backups:** `Backup.validateDomain` refuses an invalid habit duration (error `durationMinutes`). Older backups validate unchanged. Schema V3, IndexedDB v1 and ZIP `backupVersion: 2` are unchanged.
- **Sync:** the field rides in the habit record, which sync stores whole.
- **Older app versions** keep the unknown field and ignore it.

## Checks

- **Node:** `tests/habit-duration-r85.test.js`, written first; it failed 6/6. It covers:
  - the load (done, other days, weekly and paused habits, no duration);
  - the field rules, normalization, backup refusal and the sync record;
  - the calendar wiring and the line;
  - the window field, reading, the rule and the missing field;
  - Serbian;
  - the version.
- **Older tests updated (with comments):**
  - `time-blocking-v1-12`: the call with habits;
  - R84's version pin is now "or later".
- **Chromium (390 px):**
  - a new habit "Šetnja R85" with 30 minutes was saved with `durationMinutes: 30`, and no other habit gained the field;
  - Raspored said "Planirano 30 min od 6 h, od toga navike 30 min".
- **Manual-pending:** the phone.
