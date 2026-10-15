# R106 — Trajanje in Detalji navike

**Date:** 2026-10-15 · **Status:** the user asked "Slobodno odradi još promena i proveri da li je sve okej". While checking R105 in Chromium, the habit window for an existing habit turned out to have no way in. · **Release:** `2.0.0-alpha.135`. · No data-model change: `habit.durationMinutes` from R85.

## Why

- R85 lets a habit carry a duration that counts toward the day's capacity. The field is in the habit window, under "Više opcija".
- That window opens for a new habit only. Since R8c an existing habit is edited in place in Detalji navike, and the old menu with "Uredi" has no button anymore (R105 note).
- So once a habit was saved, its duration could not be set, changed or removed.

## What

- **The row:** Detalji navike → Podešavanja has a **Trajanje** row after Podsetnici. It shows "30 min", or "Nema".
- **The sheet:** a tap opens a sheet like "Dani odmora", with one field, "Trajanje u minutima (prazno = nema)".
  - **Primeni** saves at once, like the other rows (`commitHabitDetails`).
  - Empty removes the duration.
  - Outside 1–1440 whole minutes, the sheet says "Trajanje mora biti od 1 do 1440 minuta." and nothing is saved.
- **No empty field:** a habit that never had a duration gets none when another row is saved. A habit that had one keeps `null` once it is removed, as in R85.
- **Strings:** no new ones. "Duration", "min", "None", "Duration in minutes (blank = none)" and the R85 error are reused. No new CSS: `sheet-field`, `validation` and the row classes exist.

## Pages

- **The guide:** the capacity paragraph says habits with a duration count, and where to change it.
- **Šta je novo:** one line, and its range ends at alpha.135.

## Checks

- **Node:** `tests/habit-duration-details-r106.test.js`, written first; it failed 4/4.
- **Older tests updated (with comments):**
  - `redesign-r8c`: the settings rows list gains "Trajanje" after "Podsetnici";
  - R105's version pin is now "or later".
- **Manual-pending:** the phone.
