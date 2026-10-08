# Dailo redesign — design decisions

**Started:** 2026-10-08.

**Process:**
- The user sends designs one at a time, Claude reviews each one (what to keep, what to change, open questions), and the decisions are recorded here.
- Nothing is implemented until the user calls the design final.
- The mobile technology is agreed after the design; V2.0-b is on hold.

**Status words:**
- **decided:** the user decided;
- **proposed:** Claude proposed and the user has not answered yet;
- **open:** still to be discussed.

## Global

| # | Decision | Status |
| --- | --- | --- |
| G1 | **Phone bottom navigation:** Danas, Inbox, Zadaci, Kalendar, Navike, Još (six items). Goals and the other routes move under "Još". Still open: what "Zadaci" shows, and whether six labels fit at 320–375 px. | decided |
| G2 | **Adding:** one floating "+" at the bottom right (as today). No "+" in screen headers. | decided |
| G3 | **Background:** neutral graphite (the current `#0F1114` family), not the navy of image 1. The user left it to Claude's recommendation: the blue accent and the red, amber and green status colors read more clearly on a neutral base. | decided |
| G4 | **Font:** Geist for now; it may change later. | decided |
| G5 | **Density:** phone rows as in image 1 (large and easy to touch); a denser variant for desktop. | proposed |
| G6 | **Status colors:** an overdue date red, due today amber, later dates gray; priority only as a flag icon (high red, medium amber); green means done. | decided |

## Today (image 1, left)

| # | Decision | Status |
| --- | --- | --- |
| T1 | **Structure as in image 1:** the date above a large "Danas" title, the search icon at the top right, and sections with counts (Zakasnelo, Planirano danas, Navike, Završeno collapsed). | decided |
| T2 | **A simpler Today:** the Focus queue, the Daily review and Daily actions cards, goals and milestones, and the capacity item leave Today. | decided |
| T2a | **Where they go:** Claude's proposal below, accepted by the user. | decided |
| T3 | **Task rows** keep two labels on the right (priority and due date), with shorter text. | decided |
| T4 | **Habits are binary,** done or not; "20 min" is part of the name, not a value to enter. The current app also has numeric habits (`trackingType: numeric`); whether numeric tracking goes away is decided with the Habits screen. | decided |
| T5 | **Habits:** variant B (compact), but stacked one below another. Low rows with a round check instead of a square: one tap marks the habit done, and a long press offers skip and details. A weekly habit shows "2/4 nedeljno". Done habits move to the bottom. | decided |
| T6 | **Conditional notices** (backup reminder, weekly review prompt) stay at the top, only while they apply. | decided |
| T7 | **Limits:** at most 3 rows in Zakasnelo, 5 in Planirano danas and 5 in Navike. "Prikaži još N" opens the section in place, then "Prikaži manje". The choice is remembered on the device. Mock sent on 2026-10-08. | decided |

**T2a, accepted 2026-10-08:**
- **Focus:** the Focus card goes away; the order of "Planirano danas" does the same job. Focus mode (the timer) opens from the task menu ("Započni fokus").
- **Daily review and actions:** the cards go away. The section counts and "Završeno · N" cover the day, and the weekly review stays under "Još".
- **Goals and milestones:** a goal or milestone due today or overdue appears as an ordinary row in "Planirano danas" or "Zakasnelo", with a target icon instead of the checkbox.
- **Capacity:** only in Calendar → Dan.
- **Suggestions:** the section leaves Today; it can go to Inbox or Zadaci when those screens are designed.

## Task details (image 1, middle)

| # | Decision | Status |
| --- | --- | --- |
| D1 | **The task stays a modal/popup,** not a full-screen page. | decided |
| D2 | **Content basis from image 1:** a title with a checkbox, a project link, Planned, Due and Priority rows, subtasks with a count, notes, attachments and "More details". | accepted as the basis (no objection; the user can still change it) |
| D3 | **Fixes:** one completion control instead of two; a "›" on editable rows; a different icon for Due than for Planned. | decided |
| D4 | **Reminder and duration** outside "More details". | decided |

## Quick add (image 1, right)

| # | Decision | Status |
| --- | --- | --- |
| Q1 | **Bottom sheet:** title field, date and project selectors, "More options" and an "Add task" button; the same arrow style on both selectors. | accepted as the basis (no objection; the user can still change it) |
| Q2 | **Keep the Smart Quick Add preview** ("Prepoznato u naslovu", V1.10) under the field. | accepted as the basis (no objection; the user can still change it) |
| Q3 | **The return key** is not a design element: it belongs to the keyboard and differs between keyboards. | decided |

## Calendar (image 2)

| # | Decision | Status |
| --- | --- | --- |
| C1 | **Phone calendar = one month grid with dates only.** No task content inside the cells. Tapping a day lists that day's items below the grid. No Week/Month switch, no "Danas" button and no "Predstojeće" link. Arrows change the month. | decided |
| C2 | **No habits in the calendar;** they live on the Habits screen. | decided |
| C3 | **Desktop keeps the week in 7 columns,** with drag and drop to another day. | decided |
| C4 | **The day list under the grid** uses the Today rows: tasks by time, untimed at the end; goal and milestone deadlines with the target icon. | proposed |
| C5 | **Days with items get a small dot** under the date; the dot is not task content. | proposed |
| C6 | **Schedule ("Raspored")**, today the V1.12 Calendar "Dan" view: an hour grid with blocks by duration, untimed tasks above it, and capacity, all for the selected day. Options: a "Lista / Raspored" switch above the day list, or dropping the schedule and the capacity. Explained with a mock on 2026-10-08. | open |
| C7 | **No filter (funnel):** with habits gone, the calendar shows only tasks and goal deadlines. | proposed |
| C8 | **The floating "+"** adds a task planned for the selected day. | proposed |
