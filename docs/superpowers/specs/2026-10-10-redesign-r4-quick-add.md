# Redesign R4 — Quick Add (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.9`.

## What changes

1. **A bottom sheet (Q1).** Quick Add sits at the bottom of the screen like the other sheets. It has, in order:
   - a "Novi zadatak" title and X;
   - the title field ("Šta treba uraditi?");
   - the Smart Quick Add preview "Prepoznato u naslovu" (Q2, V1.10, unchanged);
   - two selectors with the same arrow style (date, and where the task goes);
   - the "Iz šablona" chip;
   - "Više opcija";
   - the "Dodaj zadatak" button.

   Enter adds and Shift+Enter adds another, as before. The return key itself is not designed (Q3).
2. **Date selector.** It opens the R3 date sheet (Danas, Sutra, Sledeće nedelje, the month, Vreme). The label shows the effective date, which is the parsed one until a date is picked, with the time, or "Bez datuma".
3. **"Gde ide zadatak" selector.** It opens the project sheet with two extra rows on top:
   - **Inbox** ("Razvrstaćeš ga kasnije");
   - **Bez projekta**: the task skips Inbox and goes to "Kad stignem" or its planned day.

   The projects follow, grouped by area. The label is the project name, "Bez projekta", or "Inbox". A task with a date and no project is never in Inbox. A picked place wins over a parsed `+project` and a template's project.
4. **"Iz šablona" (S7).** The chip is shown only when task templates exist. A chosen template fills:
   - the title, unless one was typed;
   - the plan day, unless a date was picked (a typed date still wins);
   - the due date, moved along with the plan;
   - the subtasks, the tags, the priority, the notes, the duration, the reminder, the repeat rule and the goal links, wherever the draft has none.

   The chip then reads "Šablon: {name}", with a one-line summary under it and ✕ to take the template back out. The Templates screen's "Upotrebi" opens Quick Add with the template chosen the same way.
5. **"Više opcija"** saves the task, then opens its task window (R3), where Rok, Podsetnik, Ponavljanje, Trajanje, Oznake, Prioritet, Beleške and Podzadaci are set. The Quick Add property chips, the "Više" panel, its time fields and the separate duration popover are removed. Typed `#tag`, `!priority`, `rok …` and durations are still recognized.

## Compatibility

- **Behavior.** Data and task creation rules are unchanged: picker values win over parsed ones, a project wins over an area, and Inbox only when there is no project and no plan.
- **The "Iz šablona" button** of the other new-item windows (project, habit, goal) stays.
- **Older tests.** `modal-ux-v1-6` (the "Više" focus hook) and `time-blocking-v1-12` (the duration chip, now the task window's Trajanje) are rewritten, and each rewrite cites R4. The Playwright scripts that clicked the old "Više" panel are historical browser checks, not run here.

## Tests (written first)

`tests/redesign-r4.test.js`:

- the sheet markup and the removed parts;
- the place label and the place sheet;
- Inbox / Bez projekta in `createTask`;
- the template chip: fill, user values win, clear and summary;
- "Više opcija" opening the task window;
- the version `2.0.0-alpha.9`.

`npm run smoke` adds: Quick Add with "Bez projekta" creates a task outside Inbox.
