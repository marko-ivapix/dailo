# R93 — A note on a habit's day, and habits with a limit (data model)

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"; for Navike: "Beleška uz označavanje i loše navike sa gornjom granicom"). · **Release:** `2.0.0-alpha.120`. **Data-model change:** two optional fields, one on a habit and one on a habit log. Schema V3, IndexedDB v1 and ZIP `backupVersion: 2` stay.

## The fields

- **`habit.targetMode`** is `'atMost'`, stored only on a numeric habit with a limit ("najviše 2 kafe dnevno").
  - **Absent:** the target counts up, as before. Older habits stay exactly as they were.
  - **`'atMost'`:** `targetValue` is the day's limit.
  - `normalizeState` deletes any other value, and deletes the field from a yes/no habit.
  - A habit template keeps it in `data.targetMode`, and a habit made from the template keeps the limit only when it is numeric.
- **`habitLog.note`** is a string of at most 200 characters, stored only when not empty (`Core.habitLogNote`: one line, spaces collapsed, trimmed, cut at 200 UTF-16 units as backups count them, never inside an emoji).
  - It lives in the IndexedDB `habitLogs` store with the day's record, so it needs no new store or version.
  - It exists only next to a check-in: done, not done or skipped.

## The behavior

### A limit

- **A logged day** is done while its value stays within the limit, 0 included (`Core.numericHabitState`).
  - Over the limit, the day is missed with 0 %, not partly done. It shows the red ✗ of a yes/no "not done", even today, and its reminders stop for the day (`habitDayState` → `marked`, `habitDayClosed`).
  - The year view shows such a day as missed, not "Delimično", and the week table shows no arc.
- **A day without a check-in** stays empty, as for every habit: missed once it is past, open today. A day without any is logged as 0 through the value sheet, and the guide says so.
- **`Core.getHabitTargetStatus`** (a daily or day-based limit) returns `{ current, minimumTarget: limit, idealTarget: limit, minimumMet, idealMet, status: 'within' | 'over', atMost: true }`.
  - A weekly habit with a limit still counts its good days against the week's target.
  - The recovery line counts a day of a limit habit as kept only once it is checked in within the limit.
- **The habit window:** under Brojevno a second switch, "Najmanje / Najviše" (`habit-draft-target-mode`).
  - With Najviše the field's label is "Granica", and "Minimalna i idealna" is hidden unless the habit is weekly.
  - Switching drops the day's minimum and ideal.
  - Saving keeps the field only on a numeric habit with Najviše.
- **The habit details:**
  - Praćenje reads "Brojevno · najviše 2 kafe", and its sheet has the same choice.
  - Uvid reads "1 / najviše 2 · U granici" or "Preko granice".
- **The row, the value sheet and the phone widget** read "1 / najviše 2 kafe". The snapshot item carries `atMost: true` only for such a habit.

### A note

- **The day's menu** (a tap on the habit's name on Danas or Navike, also for a past day) has a "Beleška" field with "Sačuvaj belešku" once the day is checked in. Enter saves too.
  - An empty field removes the note: "Beleška je sačuvana" / "Beleška je uklonjena".
  - Saving goes like a check-in. The habit's metadata is saved first, which owns the data and starts sync, then the log with `putIfCurrent` (`setHabitLogNote`).
- **A new value, "not done" or a skip keeps the note** (`setHabitLog` carries it over).
- **An emptied day** (the third tap of a yes/no habit's circle) takes its note along. When it had one, Poništi brings back both the day and the note.
- **The details** list the latest five notes, newest first, under "Beleške", after Uvid.

## Storage, backup and sync

- **`js/backup.js`:**
  - `habit.targetMode` other than `'atMost'`, or on a non-numeric habit, is refused (`Invalid backup: targetMode`); likewise in template data (`Template targetMode`).
  - A log's `note` that is not a string or is longer than 200 characters is refused (`Invalid backup: Habit log note`).
- **Sync:** both fields travel inside their records (`habits`, `habitLogs`); nothing else changes.

## Checks

- **Node:** `tests/habit-note-limit-r93.test.js`, written first; it failed 7/7. It covers:
  - the limit: done within, missed over, 0 is fine, the ✗ and the reminders, an empty day, the year view, the weekly target;
  - the fields' normalization and the note's shape;
  - backups and sync;
  - the note kept on check-in, written from the menu, listed in the details, and the Poništi of an emptied day;
  - the window, the row, the details, templates and the widget;
  - Serbian and the guide;
  - the version.
- **Older tests updated (with comments):**
  - `redesign-r37`: the week table's arc;
  - `habit-states-r61`: the tap cycle keeps the previous log;
  - R92's version pin is now "or later".
- **Chromium:** see the ledger row.
- **Manual-pending:** the phone (the note field with the phone keyboard, the widget's line), and sync between two devices.
