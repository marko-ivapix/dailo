# Redesign R16 — a habit's start in its details (design)

**Date:** 2026-10-10 · **Status:** the user's request with a screenshot of Navike → Nedelja ("stavi da bude u planu svakog dana u mesecu"). Their habits were made on Thursday 8 October, so Monday to Wednesday read "Nije u planu". It adds to S13 / R8c of `2026-10-08-redesign-decisions.md` · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.39`.

## Why

- **The rule:** a habit is planned only from its start date (`habit.startDate`, the day it was made unless chosen otherwise). Days before that day read "Nije u planu".
- **The gap:** the start can be chosen only in the new habit window, under "Više" → "Početak". The habit details window (R8c), where habits are now edited, has no "Početak" row. So an existing habit's start could not be moved back to the 1st of the month.
- **What this step does not do:**
  - The app's data on the user's phone cannot be changed from here.
  - Changing every habit at once would be a bulk action, which `AGENTS.md` rules out.
  - A silent change to the start dates would be a hidden data migration, which `AGENTS.md` also rules out.

## What changes

1. **"Početak" in the habit details window.** The Podešavanja card of "Detalji navike" gets a "Početak" row before "Kraj".
   - **The value:** "Danas", or the start date.
   - **The tap** opens the same date sheet as in the new habit window.
   - **"Primeni" saves at once,** like every other row in the details window (`commitHabitDetails`). The calendar, the week rings, the Nedelja grid and the progress follow from the new start.
2. **"Početak meseca" in the start sheet.**
   - **The chips:** the "Početak" sheet offers "Početak meseca" (the 1st of the current month), "Danas" and "Sutra".
   - **The result:** two taps make a habit planned on every day of the month.
   - **Other date sheets** (Planirano, Rok) keep "Danas", "Sutra" and "Sledeće nedelje".

## Compatibility

- **Data:** no new fields. `habit.startDate` already exists, and backups and sync carry it.
- **Earlier start dates:**
  - Days between the new start and today count as planned, so a day without a check-in reads "Propušteno".
  - Past days can be checked in from the habit's calendar, as before.

## Tests (written first)

`tests/redesign-r16.test.js`:

- the row in the details window and its opener;
- the chips of the start sheet;
- the start sheet saving at once in the details window and only filling the draft in the new habit window;
- the commit action;
- the Serbian text;
- the version `2.0.0-alpha.39`.
