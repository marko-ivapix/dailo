# Redesign R37 — habits, calendar and settings additions after the third design pass (design)

**Date:** 2026-10-12 · **Status:** additions D, F and J of `docs/superpowers/specs/2026-10-12-design-pass-3.md`, which the user approved with "moze sve". · **Release:** `2.0.0-alpha.63`.

## What changes

1. **Habits** (D).
   - **One-tap values:** on Danas, a numeric habit row shows its first two quick values ("+250").
     - **A tap:** it adds the value to today's total at once.
     - **Poništi:** the toast "Vrednost dodata" offers it, and it brings back the previous total or the skip.
     - **The circle:** it still opens the value sheet.
   - **Nedelja:** a numeric day that is short of its target shows how far it got as an arc in its cell (`is-partial`, `--fraction`).
   - **"Juče nije zabeleženo: N":** until noon, Danas shows this line under the habits when active habits have no record of yesterday. Skipped days count as records (`Core.habitsMissedOn`). The line opens Navike on yesterday.
2. **The calendar** (F).
   - **Coming dates of repeating tasks:** they appear in the calendar, are computed only for the screen and are never stored (`Core.calendarRepeats`).
   - **What they follow:** open, active repeating tasks. The task's own date is not shown twice, and a skipped next date is left out.
   - **Mesec:** a day that has only repeats gets a hollow dot.
   - **The selected day's list and Predstojeće:** they show "Ponavlja se" rows that open the repeating task.
3. **Settings** (J).
   - **Veličina teksta** (Opšte): Manja, Uobičajena, Veća or Najveća.
     - **Device-local:** it is a choice for this device only (device-local key `dailoTextSize`, outside state, backups and sync).
     - **How it works:** it sets `data-text-size` on `<html>`, and every step of the type scale is multiplied by `--text-scale` (0.92, 1, 1.12 or 1.25).
     - **Fields:** they never go under 16 px (`--text-input: max(16px, …)`).
   - **Probni podsetnik** (Podsetnici): "Pošalji" shows a notification five seconds later.
     - **On the phone:** a local notification with its own id, which `reconcile` leaves alone (`extra.test`).
     - **In the browser:** a browser notification when they are allowed. Otherwise a toast says why nothing arrives.
   - **Stanje podataka** (first row of Podaci): one line with the counts of tasks, projects, habits, and notes and resources, and the age of the last backup.
     - **Green:** when the last backup is no older than the backup reminder and the storage is kept (persistent, or the app).
     - **Amber:** otherwise.

## Data

- **No new field and no backup change.** The only new key is the device-local `dailoTextSize`.
- **Calendar repeats:** they are computed, not stored.

## Checks

- **Node:** `tests/redesign-r37.test.js`.
  - **Old tests updated:** V1.5 (`init` harness), R2 (`renderToday` harness), R8a (the partial cell and `habitsEntryDay`), R10g (the new Settings rows) and R34 (the type scale now scales).
  - **Version check:** R36's version check now reads "≥ 62".
- **Smoke:** Veličina teksta applies on this device only (`data-text-size`, the device-local key, nothing in state), and Podaci starts with "Stanje podataka".
- **Manual-pending:**
  - text sizes on a phone;
  - the test notification on Android and iOS;
  - the habit quick values and the arcs;
  - visual checks.
