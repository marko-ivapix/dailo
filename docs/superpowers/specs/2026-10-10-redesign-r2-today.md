# Redesign R2 — Today (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.7`.

## What changes

1. **Header (T1).** The long date sits above a large "Danas" title, with the search icon at the top right. There is no add button, no "Focus View" switch and no "Focus" button.
2. **Conditional notices (T6)** stay at the top, and only while they apply: the first-run transfer notice in the app, the backup reminder and the weekly review prompt.
3. **Sections (T1, T2a).**
   - **Zakasnelo · N:** overdue tasks, then overdue goals, then overdue milestones.
   - **Planirano danas · N:** today's tasks in the user's order (drag still reorders them), then goals and milestones due today. When it is empty: "Ništa nije planirano. „+“ dodaje zadatak za danas."
   - **Navike · done/total:** today's habits, with done habits at the bottom.
   - **Završeno · N:** folded until opened (unchanged).

   The Inline "+ Dodaj zadatak" row in "Planirano danas" stays.
4. **Limits (T7).** At most 3 rows in Zakasnelo, 5 in Planirano danas and 5 in Navike. "Prikaži još N" opens the section in place, and "Prikaži manje" folds it again. The choice is remembered on the device in `ui.todayExpanded` (`{ overdue, today, habits }`, booleans). `ui` is device state; it is never synced.
5. **Task rows on Today (T3, G6).** A row has:
   - the checkbox;
   - the title and one meta line (planned time · project, or area when there is no project);
   - on the right, the priority flag (high red, medium amber; nothing for low or none) and the due label: "Rok danas" in amber, a past due date in red, and "Rok sutra" or "Rok {date}" in gray.

   The ⋯ task menu stays until R3 moves it into the task window. The "daily focus" and "plan" row buttons leave Today.
6. **Goal and milestone rows (T2a).** They show a target icon instead of the checkbox, the title, and a meta line: "Cilj · 45%" for a goal, "Etapa · {goal}" for a milestone. The due label sits on the right, and a tap opens the goal. Milestones due today are new on Today: `Core.deriveTodayV3` gains `milestones`, the open milestones of active goals dated today.
7. **Habit rows (T5, H6).**
   - **The round check** marks a checkbox habit done; tapping it again sets it back. A done habit shows a green check, and a skipped one a dashed circle.
   - **Numeric habits:** the circle fills with today's progress, and the right side shows "1,5 / 2 l". A tap opens a small value sheet with the quick values, a total field and "Primeni".
   - **Weekly target habits:** the circle fills with the week's progress, and the right side shows "2/4 nedeljno".
   - **The menu** opens with a long press on the circle, or with a tap on the name. It offers "Upiši vrednost" for a numeric habit, "Preskoči danas" / "Poništi preskakanje" for a checkbox habit, and "Detalji navike".
8. **What leaves Today (T2, T2a).**
   - **Removed cards:** the Focus card, Daily review, Daily actions and the summary strip with its filter.
   - **Capacity** stays only in Calendar → Dan.
   - **Suggestions** move to the top of "Zadaci" as a folded card with its count: "+ Danas" on each row and "Dodaj sve u Danas" (Z2, early, so nothing is lost before R5).
   - **Focus mode** still opens from the task window.
9. **Settings (M3, M6).** "Podrazumevani filter za Danas", "Kartice na ekranu Danas" and "Sažetak dana" leave Settings, because the new Today has nothing for them to choose. Their stored values stay untouched and valid in backups.

## Compatibility

- **Data and logic unchanged.** Data, backups and sync are the same. `Core.filterTodayTasks`, the dashboard settings and `focusTaskIds` keep their normalization and validation.
- **Tasks.** Completing, reordering by drag and the swipe gestures behave as before.
- **Older tests.** The tests that pinned the removed Today cards (`tasks-today-v1-5`, `tasks-today-v1-6`, `time-blocking-v1-12` for the Today capacity item, `design-v1-8` for the strip, `ui-v1-6-today.py`) are rewritten to the new Today, and each rewrite cites R2.

## Tests (written first)

`tests/redesign-r2.test.js`:

- the header, the notices and the section order with counts;
- the limits and the remembered expansion;
- the task row labels and colors;
- goal and milestone rows, and `deriveTodayV3().milestones`;
- habit rows (circle, right text, done at the bottom) and the menu entries;
- the value sheet;
- what left Today and where the suggestions went;
- the removed settings;
- the version `2.0.0-alpha.7`.

`npm run smoke` adds: Today shows "Planirano danas", a habit check marks the habit done, and "Zadaci" shows the suggestions card when there is a suggestion.
