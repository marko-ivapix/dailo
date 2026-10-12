# Redesign R31 — planning-side bugs from the third design pass (design)

**Date:** 2026-10-12 · **Status:** findings 4 and 9–15 of `docs/superpowers/specs/2026-10-12-design-pass-3.md`, which the user approved with "moze sve". · **Release:** `2.0.0-alpha.57`.

## What changes

1. **The year in dates** (finding 4). `formatDate` adds the year whenever a date is outside the current year, in both the short and the full form. A goal due next October no longer looks due today.
2. **Numeric habits** (finding 9).
   - **Skipping:**
     - **Where:** a numeric habit can be skipped like a checkbox habit, from the row menu and from the details window.
     - **How it is stored:** `setHabitLog` keeps the skip as it is.
     - **How it counts:** `Core.habitStatusForDate` reads it as skipped, not as missed.
   - **The value sheet:**
     - **Focus:** it opens without the keyboard. The first quick value, or Close, gets the focus.
     - **Quick values:** a tap saves at once, so closing the sheet never loses "+0,25 l".
   - **"+" on Navike** opens "Nova navika". The habit is not filed in Inbox.
3. **Kalendar → Raspored** (finding 10).
   - **Deadlines:** "Rok ovog dana" lists the day's deadlines that Lista shows: tasks due that day, goals and milestones.
   - **Hours:** the grid runs from 8 to 21 and grows only to fit the blocks.
   - **Overlaps:** overlapping blocks sit side by side. `Core.daySchedule` gives each block a lane and the lane count.
   - **Today:** the grid has a line at the current time.
4. **Plurals and wording** (finding 11).
   - **Task counts:** the counts of a task-linked goal use plurals ("0 od 1 zadatka", "0 / 3 zadatka").
   - **Habit contributions:** they read "4 od 10 · unosi".
   - **Empty values:** "None" is "Nema".
5. **Example texts** (finding 13).
   - **Packing tasks:** they read as sentences ("Spakuj šator i opremu za spavanje", "Spakuj odeću").
   - **Gender-neutral wording:** "Pozovi roditelje ili nekog bliskog".
   - **Other R29 texts are smoother:** "Uzmi nazad depozit…", "Sa mobilnog telefona radi i 112", "Leti balonom na topli vazduh", "Šešir i naočare za sunce".
   - **The first example set:**
     - it no longer adds "No-nut" or a second "Balzam za bradu";
     - its guide is now "Kako isplanirati nedelju".
   - **Existing items** are not changed.
6. **The goal window** (finding 14).
   - **Milestone order:** milestones follow their dates, undated last.
   - **Late milestones:** one after the target date says "Posle ciljnog datuma", and its date field cannot pick a later day.
   - **Empty counts:** "Etape" shows a count only when there are milestones.
   - **No open tasks:** the tasks card says "Nema otvorenih zadataka."
   - **No target date:** such a goal reads "Napredak je na dobrom putu."
7. **Past days** (finding 15).
   - **Completed tasks:** a past calendar day shows a fold, "Završeno ovog dana · N".
   - **Empty past day:** it says "Ovog dana nema otvorenih zadataka."
   - **"+" on a past day** plans for today, so a new task is not late at once.

## Checks

- **Node:** `tests/redesign-r31.test.js`. Older tests that pinned the replaced code (insights V1.5, R2, R7, R8c, R9a, R9b, R10b, R29 and V1.12) gained R31 notes, a pinned clock where a day must stay "today", or updated patterns.
- **Manual-pending:** visual and device checks.
