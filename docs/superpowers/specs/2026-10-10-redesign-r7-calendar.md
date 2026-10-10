# Redesign R7 — Calendar (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.12`.

## What changes

1. **Top (C1, C7).** The "Kalendar" title and a "Nedelja / Mesec / Predstojeće" switch. There is no "Dodaj" button, no "Danas" button, no type filter and no summary strip. Since there is no "Danas" button, the Calendar starts on today whenever it is opened from another screen.
2. **What a day holds (C2, C4, S10).**
   - Open tasks appear on their plan day. A task without a plan day appears on its due day.
   - The goal targets of active goals and their open milestones appear on their date.
   - Habits are not in the Calendar; they live on the Habits screen.
   - Completed tasks and the tasks of archived projects are left out.
3. **Nedelja (C1, C3, C5, C9).**
   - The week bar shows the period ("5–11. okt 2026") and the arrows for the previous and next week.
   - A strip of seven days follows. Each day shows its weekday, its date and a small dot when it has items.
   - A tap selects the day.
   - On a wide screen (≥ 1024 px) each day is a column with its items as cards. A task card can be dragged to another day, as before.
4. **Mesec (C1, C5, C9).** The month bar and arrows, then a grid with the weekday names and only dates and dots. A tap selects the day. Moving to another month selects today when that month holds it, otherwise its first day.
5. **The selected day (C4, C6).**
   - Below the week or the month, the day panel shows the long date and a small "Lista / Raspored" switch. "Lista" is the default.
   - **Lista** uses the Today rows: timed tasks by time, then goal and milestone deadlines with the target icon, then the untimed tasks. An empty day reads "Nema zadataka za ovaj dan. „+“ dodaje zadatak za ovaj dan."
   - **Raspored** is the V1.12 day view for that day: capacity, "Bez vremena" with time fields, and the hour grid where a block can be dragged to another hour.
6. **Predstojeće (C9).**
   - The next 21 days, from tomorrow, grouped by day. A group is headed "Sutra" or the weekday name, with the short date.
   - The rows are the same as in Lista. An empty list reads "Ništa u narednim danima".
   - The old Upcoming screen is gone: its row leaves "Još", and the `#upcoming` route (Weekly review, the old sidebar, the U shortcut) opens this view.
7. **The floating "+" (C8)** adds a task planned for the selected day in Nedelja and Mesec. In Predstojeće it adds to Inbox, as elsewhere.

## Removed

- The Day Detail window, with its habit check-in, value edit, goal progress and "+ Zadatak / Cilj / Navika" buttons.
- The type filter and its stored `ui.calendarVisibility` checks in the screen.
- The summary and legend strip.
- The "Dan" view as a separate view.
- The separate Upcoming screen.

## Fixed on the way

The selected button of the shared switch (`.view-tabs .btn.is-selected`) had no style since R1. The Zadaci switch is affected too. It now uses the V1.8 active look.

## Compatibility

- **Data:** unchanged.
- **`ui.calendarView`** is now `week`, `month` or `upcoming`. A stored `day` becomes `week` with the day panel on Raspored.
- **New `ui.calendarDayMode`:** `list` (default) or `schedule`.
- **`ui.calendarVisibility`** is still normalized but no longer read by the screen. Core keeps `deriveCalendarDay`, `deriveCalendarWeek`, `deriveCalendarMonthSummary` and `calendarTimeBlocks` for their tests.
- **New `Core.calendarDayItems(state, date)`** returns `{ date, timed, untimed, deadlines, count }`.
- **Unchanged:** drag to another day (week columns) and hour (Raspored); the time fields; capacity; Search.
- **Old tests** that pinned the V1.6–V1.12 calendar markup now pin the R7 markup, with an R7 note.

## Tests (written first)

`tests/redesign-r7.test.js`:

- `Core.calendarDayItems` covers the plan or due day, time order, deadlines, completed tasks left out, and archived projects left out through `listTasks`;
- the header without Dodaj, Danas or the filter, and the three-way switch;
- the week strip with dots, the selection and the desktop cards with drag;
- the month grid with dots and blanks;
- the day panel in Lista and in Raspored, and its empty state;
- Predstojeće with its groups and empty state;
- the `calendarView` and `calendarDayMode` normalization, including a stored `day`;
- navigation by week and by month;
- the floating "+" for the selected day;
- the `#upcoming` route, the removed "Još" row and the removed Day Detail code;
- the version `2.0.0-alpha.12`.

`npm run smoke` adds: Kalendar → a dot on a planned day → tap → the task in Lista → Raspored.
