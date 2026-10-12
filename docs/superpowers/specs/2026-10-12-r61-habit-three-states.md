# R61 — three states for a yes/no habit (data-model spec)

**Date:** 2026-10-12 · **Status:** the user's request: "Da li za navike mozemo da imamo 3 stanja? … crveno x. Kada se jednom klikne na naviku onda je stanje urađeno, kada se još jednom klikne onda je stane da nije urađeno i treći klik vraća na početak tj neutralno". · **Release:** `2.0.0-alpha.88`.

## Data model

No new field or value: schema V3, IndexedDB v1, the ZIP `backupVersion: 2` and the sync records stay as they are.

- **What changes is the meaning of an existing value.** A habit log of a **yes/no** (checkbox) habit with `status: 'missed'` now means "marked not done" and is shown as a red ✗. Before R61 a second tap wrote the same `missed` log, but it looked like an unrecorded day.
- **"Not recorded"** (neutral) is **no log at all**. A third tap deletes the day's log through `TodoStorage.habitLogs.deleteIfCurrent`, with the usual compare-and-set and rollback. Sync sends the deletion like any other.
- **Numeric habits are unchanged.** Their `missed` log still means "below the target" (partial), and a tap still opens the value sheet.
- **Older versions** (alpha.87 and before) show a `missed` log as an unrecorded day, as they always did, and still write `missed` on a second tap. On a newer device such a day therefore shows a red ✗. Backups and sync are compatible both ways.

## The change

- **Core:**
  - **`habitStatusForDate`:** adds `logged: true` when the day has a log.
  - **`habitDayState`:** returns `{ state: 'missed', marked: true }` for a logged `missed` day of a yes/no habit.
    - This applies today too; before, it was `open`.
    - The day counts as planned for daily habits and not for weekly ones, whose days are not planned one by one.
    - A day without a log is never `marked`.
  - **`habitDayClosed`** (now exported) treats a marked day as closed, so its reminders stay silent like a done or skipped day.
  - **`habitsWidgetSnapshot`:** items carry `missed`, and the Android widget's line starts with "✗".
- **The tap** on a habit's circle (Danas, Navike Dan and Nedelja, the details window):
  - the cycle is empty → done (✓) → not done (✗) → empty;
  - a skipped day goes to done.
- **The look:**
  - **The row circle:** "not done" is a filled red circle with a white cross (`habit-circle is-missed`, `--danger-fill`), and the row gets `is-missed`. The circle's accessible name says the state: "Urađeno", "Nije urađeno", "Preskočeno" or "Nije zabeleženo".
  - **Nedelja and the details calendar:** the day is filled red (`is-marked`). Nedelja also draws a cross.
  - **The Nedelja legend** adds "Nije urađeno" next to "Urađeno". A past day nobody touched keeps the red outline, "Propušteno".
- **Not changed:** numeric habits (the value sheet) and the menu's "Preskoči".

## Checks

- **Node:** `tests/habit-states-r61.test.js`, written first; it failed 6/6. It covers:
  - Core: the mark today and in the past, numeric and weekly habits, closed days, the widget;
  - the row's circle and name in each state;
  - the tap cycle and the clearing with rollback;
  - the week grid, the calendar, the legend and the CSS;
  - Serbian;
  - the version.
- **Older tests updated, with comments:** `core-v1-3`, `redesign-r2`, `redesign-r8a`, `redesign-r14b`, `redesign-r23`, `redesign-r31`, `redesign-r45` and `emails-r60` (the version).
- **Smoke:** on Navike Dan a habit goes done → not done (red ✗) → empty → done.
- **Manual-pending:** the look and the taps on the phone, and the widget line on Android.
