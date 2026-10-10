# Redesign R10f — Pretraga and Fokus (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.24`.

## What changes

1. **Pretraga (S11): a full-height window with the field on top.**
   - "Pretraga" with X, then the field ("Pretraži zadatke i projekte…").
   - The results come in the same two groups as before, now with their counts and in cards: "Zadaci · N" and "Projekti · N".
   - A project row reads "Projekat · arhiviran" when the project is archived.
   - **Unchanged:**
     - the scope: task titles and notes, completed included; project names, archived included;
     - the ranking and the grouping;
     - the 120 ms pause, the 50 / 20 cap and its note (M11);
     - the empty texts.
   - The user does not want a wider search (2026-10-09).
2. **Fokus (S12): a tall window started from the task window's menu ("Započni fokus"), as before.**
   - "Fokus" with X.
   - The task's title as a big line, with one meta line: project · Kasni / Rok · Planirano · Prioritet.
   - **The count-up timer** in a ring, labeled "Proteklo", with Pauziraj / Nastavi and Resetuj.
   - **"Podzadaci · done/total":** the subtasks can now be ticked here (they were read-only).
   - **"Beleške":** the task's notes.
   - **At the bottom:** Sutra, Sledeći and Detalji in one row, then the big "Završi zadatak". Each does what it did:
     - Sutra plans the task for tomorrow and moves on;
     - Sledeći moves to the next overdue or Today task;
     - Detalji opens the task window;
     - Završi completes the task and moves on.
   - "Nema više ničega za fokus" stays when nothing is left.

## Removed

- The search box modal with X inside the field.
- The focus dialog layout with the separate "Izađi" button. X closes it.

## Compatibility

- **Data:** unchanged.
- **The search order** is `Core.searchItems` without change.
- **Ticking a subtask in Fokus** uses the same path as the task window.

## Tests (written first)

`tests/redesign-r10f.test.js`:

- the search window, its header, field, groups with counts, rows and the archived project;
- the focus window: header, meta line, ring, buttons, tickable subtasks, notes, footer and the empty state;
- the version `2.0.0-alpha.24`.

`npm run smoke` adds: the search icon → "rep" → the results show "Zadaci ·"; the task menu → Započni fokus → a subtask is ticked in Fokus → X.
