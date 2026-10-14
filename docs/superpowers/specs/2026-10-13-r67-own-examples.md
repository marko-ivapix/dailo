# R67 — the user's own starter examples and the rough month

**Date:** 2026-10-13 · **Status:** the user's request. They listed their own projects and items and showed the lists they kept before ("To buy" with Cena, Vrsta and Mesec; "To learn" with Vrsta and Datum). They asked: "ti ih preradi kako mislis da treba … da li bi mogao ti lepo ovde u chatu da mi razvrstas sve ovo". They accepted the proposed sorting with "da, zameni primere, okvirni datum opcija 2". · **Release:** `2.0.0-alpha.94`. · **Data model:** `docs/superpowers/specs/2026-10-13-r67-rough-month-data.md`.

## The change

- **"Popuni primerima"** (Podešavanja → Podaci) now adds the user's structure in place of the R29 set:
  - **Areas (5):** Lično, Posao, Dom, Zdravlje, Hobi i priroda. "Personalni" and "Poslovni" became Areas because they never finish.
  - **Projects (7, as lists):**
    - Namirnice (Dom): jaja, mleko, banane, omekšivač. Omekšivač moved here from "To buy" because it is a consumable.
    - Za kupovinu (Dom): pegla, patosnice, ratkapne, alat.
    - Odeća (Lično): majica, dukserica, čarape.
    - Motor (Hobi i priroda): letnja jakna, lanac i lančanici, akumulator.
    - Za učenje (Lično): JavaScript, Canva, Photoshop, Figma (kurs Marka Pešića), enterijer, kako se gradi kuća, muzički instrument, kuvanje, plan treninga, plan ishrane.
    - Bucket lista (Lično): the nine R29 dreams. The instrument moved to Za učenje.
    - Filmovi i serije (Lično): three titles, checked off once watched.
  - **Tags (7):** Kuća, Privatno, Posao, Umetnost, Hobi and Zdravlje, taken over from the user's "Vrsta" column, plus Kupovina. Tasks in one project share the project's Area, so inside the lists the tags make the split.
  - **Rough months (see the data-model spec):**
    - **Za kupovinu:** next month for the iron and the mats, the month after for the hubcaps.
    - **Odeća:** this month for the T-shirt and socks, next month for the hoodie.
    - **Motor:** the coming March for the chain and the battery, April for the summer jacket.
    - **Za učenje:** the coming January, as in the user's list, for the work tools and the training and meal plans.
  - **Habits (10):** the user's routines from the first set. They keep their `area-routines-v1` keys and now have Areas.
  - **Templates (2), not projects, because the trips repeat:**
    - **Kampovanje:** the user's packing list in five tasks with subtasks: Spavanje, Voda i jelo, Higijena, Oprema, Odeća.
    - **Planinarenje:** the weather, telling someone the route, and the backpack.
  - **Resources (5):**
    - the Figma course by Marko Pešić (type Kurs), linked to its task;
    - four books (type Knjiga), linked to the reading goal.
  - **Goals (3):**
    - Spremi motor za sezonu, which counts the Motor tasks and is due on the first day of April at least a month away;
    - Pročitaj 12 knjiga za godinu dana, numeric;
    - Budi u formi, which counts the four-a-week training habit for twelve weeks.
  - **Notes (2):** Veličine odeće, Hitni brojevi.
  - **Left out:** the old weekly-plan projects, the moving and birthday projects, the recurring chores, the cleaning rooms and the trip and camping links.
    - The cleaning rooms stay available from the Redovne obaveze screen's own examples.
    - An existing workspace keeps whatever the earlier sets added.
  - **Matching:** the same rules as before. A second run adds only what is missing, and an item with the same name (any case) is reused, not duplicated.
- **Code:**
  - `js/starter-examples.js` holds the whole set (`workspaceExamples`). `addStarterExamples` in `js/habits-ui.js` only saves it, rolls back a failed save and reports the counts.
  - The Settings row describes the new set.
  - The Serbian catalog gains the new names and loses the 168 entries of the old set.
- **The rough month in the app:**
  - **Task window:** a "Okvirno" row under Planirano opens "Okvirni mesec". Twelve month chips start at the current month; a tap applies at once, and "Ukloni mesec" clears it. The sheet notes that the month keeps the task out of Danas and lists it in Predstojeće.
  - **Task rows:** an open task without a planned day shows "Okvirno novembar" after the due label.
  - **Predstojeće:** after the 21 days, one section per month ("Novembar · okvirno") lists the open tasks that have that month and no planned day.

## Checks

- **Node:**
  - `tests/own-examples-r67.test.js` was written first; 19 of its 20 tests failed. A sync-record test was added afterwards, for 21 tests. It covers:
    - the data model;
    - the window row and its sheet, driven through the tasks module;
    - the row meta and the Upcoming code;
    - every collection of the example set, with the links between them;
    - validation, a second run, reuse of own items, the toast and rollback;
    - the Serbian names and the version.
  - Older tests changed, each with a comment naming R67:
    - **R29:** the content tests moved to R67; validation, load order, version and progress type stay.
    - **R31 item 13:** the remaining catalog texts.
    - **R33 item 25:** area icons and colors now come from the new module.
    - **R3:** the window gained the Okvirno row.
    - **R11d:** the meta line has the month.
    - **R57:** the outside links still collected are the book and the privacy-office page.
- **Smoke:**
  - The task window's Okvirno sheet sets next month on a task.
  - Predstojeće lists "Pegla" under next month with "okvirno".
- **Other suites:**
  - `npm run verify`: 1219/1219.
  - `npm run smoke`: OK.
  - `npm run check:python`: 4/4.
  - `npm run check:links`: OK.
- **Numbering:** the work started as "R59" on an older `main`. R59–R65 had meanwhile merged from another session, so the step became R67 with `2.0.0-alpha.94`.
- **Manual-pending:**
  - Run "Popuni primerima" on the phone and look at Zadaci → Projekti, Šabloni and Predstojeće.
  - Set and remove a month in the task window.

## Fixes after the code review

The `code-reviewer` agent confirmed three problems in `9b346ca`:

- **A linked goal stuck at 0%.**
  - On a workspace that had run the earlier examples, "Budi u formi" became `linkedHabits` with no link. The training habit keeps its key, so it is not added again.
  - "Spremi motor za sezonu" did the same when a "Motor" project already existed.
  - Such a goal is now manual, and the existing items stay unchanged.
- **The motorcycle goal could fall due in days.** Run in March, it could be due on April 1st only a few days later. It now falls on the first April 1st at least 30 days away.
- **Predstojeće listed a task twice.** A task with a rough month and a due date within the 21 days appeared on its day and again under its month.
  - `Core.deriveRoughMonths` takes an optional `dueShownUntil` and leaves those tasks out.
  - Predstojeće passes today + 21 days.

Three tests in `tests/own-examples-r67.test.js` cover these fixes; all three failed before the fix. `npm run verify` 1222/1222, smoke OK.

