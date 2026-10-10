# Redesign R5 — Zadaci and the project screen (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.10`.

## What changes

1. **The Zadaci top (Z1, Z2)** keeps the title, the search icon, the summary and the suggestions card from R1 and R2.
   - The summary now counts sorted open work: open tasks outside Inbox and outside archived projects, then the active projects.
   - The switch reads "Kad stignem · N" and "Projekti".
2. **Kad stignem (Z3, Z5):**
   - the note "Razvrstani zadaci bez planiranog dana, po projektima.";
   - the open tasks without a plan day, grouped by project, with "Bez projekta" first and the active projects in their order;
   - each group has a header with its color dot and count;
   - rows in the Today style (T3), where the project name is left out inside a project's group;
   - "+ Dodaj zadatak", which adds without a plan and outside Inbox.
3. **Projekti (Z6):**
   - a "Bez projekta" row with its open count on top;
   - the active projects grouped by area, then the projects without one under "Bez oblasti";
   - "+ Novi projekat" at the end.

   A project row has the color dot, the name, "N otvorenih" with the nearest due date in the G6 colors, and a thin bar of the share of done tasks. A tap opens the project.
4. **The project screen (Z7):**
   - "‹ Zadaci" and ⋯;
   - the name with its color and one line: area · N otvorenih · M završenih;
   - the first linked goal as "Cilj: … · 45%" (it opens the goal);
   - the open tasks in Today rows (drag still orders them) and "+ Dodaj zadatak";
   - the done tasks folded at the bottom ("Završeno · N").

   The ⋯ menu has Preimenuj i boja, **Oblast** and **Povezani ciljevi** (both new sheets), Sačuvaj kao šablon, Arhiviraj / Vrati and Obriši. The Oblast choice applies at once, and the tasks follow their project's area. Povezani ciljevi is a multi-choice sheet with "Primeni"; new links count all of the project's tasks, and the goal history records them as before.
5. **"Bez projekta" screen** (`#project/none`):
   - the sorted open tasks without a project;
   - "+ Dodaj zadatak" (outside Inbox);
   - their done tasks folded;
   - the note "Razvrstani zadaci koji ne pripadaju nijednom projektu."
6. **Archived projects (S10).**
   - **The project screen** shows "Arhiviran projekat" with "Vrati" on top, read-only: no "+ Dodaj zadatak" and no drag.
   - **Lists:** the tasks of an archived project leave Today, Zadaci (both views and the suggestions) and Predstojeće until it is restored. The Calendar follows in R7. Search is unchanged (S11).
7. **The floating "+" → Zadatak** adds for the screen it is on:
   - on Danas, a task planned for today;
   - on a project, a task in that project;
   - in Kad stignem and "Bez projekta", a task outside Inbox;
   - on an archived project, nothing, with the message "Vrati projekat da bi dodao zadatke.";
   - elsewhere, a task in Inbox, as before.

## Compatibility

- **Data and order.** Data and the project order are unchanged. Archiving and restoring keep Undo.
- **Tests.** `redesign-r1` pinned the switch labels; it now expects the counted label (R5 note).

## Tests (written first)

`tests/redesign-r5.test.js`:

- the groups of Kad stignem;
- the project rows and the area grouping;
- the project screen and the "Bez projekta" screen;
- the archived notice and read-only state;
- `listTasks` used by Today, Zadaci and Predstojeće;
- the area and goals sheets;
- the floating "+" context;
- the version `2.0.0-alpha.10`.

`npm run smoke` adds: Projekti → a project → its screen with "‹ Zadaci".
