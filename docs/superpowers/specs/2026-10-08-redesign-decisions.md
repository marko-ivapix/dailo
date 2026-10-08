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
| T4 | **Habit tracking** (revised 2026-10-08): both checkbox and numeric habits stay; a new habit defaults to checkbox and every day (7 days a week). Today shows a checkbox habit as a round check (T5); how a numeric habit is shown on Today is open (H6). | decided |
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
| D3 | **Fixes:** one completion control instead of two, the large "Završi zadatak" button at the bottom of the task window (no checkbox by the title; "Vrati kao otvoren" when done); a "›" on editable rows; a different icon for Due than for Planned. Shown in the task prototype on 2026-10-08. | decided |
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
| C1 | **Phone calendar views** (image 10, revised 2026-10-08): a "Nedelja / Mesec / Predstojeće" switch at the top. No "Danas" button, no filter, no "+" in the header. Arrows change the week or month. In the month grid, only dates and dots (C5), never task content or count icons. Tapping a day in the week strip or the month grid lists that day's items below. | decided |
| C2 | **No habits in the calendar;** they live on the Habits screen. | decided |
| C3 | **Desktop keeps the week in 7 columns,** with drag and drop to another day. | decided |
| C4 | **The day list under the grid** uses the Today rows: tasks by time, untimed at the end; goal and milestone deadlines with the target icon. | accepted as the basis (shown in the mock; no objection) |
| C5 | **Days with items get a small dot** under the date; the dot is not task content. | decided |
| C6 | **Schedule ("Raspored")**, today the V1.12 Calendar "Dan" view, for the selected day: an hour grid with blocks by duration, untimed tasks above it, and capacity. A small "Lista / Raspored" switch next to the day title; "Lista" is the default. Desktop drag to another hour stays. | decided |
| C7 | **No filter (funnel):** with habits gone, the calendar shows only tasks and goal deadlines. | decided |
| C8 | **The floating "+"** adds a task planned for the selected day. | decided |
| C9 | **View contents:** Nedelja is a strip of 7 days with the selected day's list below. Mesec is the grid with the selected day's list below. Predstojeće is a list of the coming days, grouped by day; it replaces the separate Upcoming screen under "Još". The "Lista / Raspored" switch (C6) applies to the selected day in Nedelja and Mesec. | accepted as the basis (no objection) |

## Task editing and pickers (images 3–9)

Images 3–9: "Edit task", and the Project, Planned date, Priority, Reminder, Tags and Repeat sheets.

| # | Decision | Status |
| --- | --- | --- |
| E1 | **One task window, no separate "Edit task" screen and no "Save changes".** Tapping the title edits it, and tapping a row opens its sheet. Every change saves at once, as in the current app. The window takes the groups from image 3: Planiranje (Planirano, Rok, Podsetnik, Ponavljanje, Trajanje), Organizacija (Projekat, Oznake, Prioritet), Više opcija. A recurring task still asks "samo ovaj ili sve buduće". | decided |
| E2 | **Pickers are bottom sheets on the phone,** all built the same way: grabber, title, X, rows in cards, button at the bottom. On desktop the same content opens as a small popover next to the row. | decided |
| E3 | **No "Primeni" for a single choice:** tapping a project or a priority applies it and closes the sheet. Multi-part sheets (tags, date with time, reminder, repeat) keep one button, always labelled "Primeni". | decided |
| E4 | **Planned date (and due date):** quick choices Danas, Sutra, Sledeće nedelje (instead of "Pick date"); a month calendar with the selected day as a circle; a time row; the note that the other date stays unchanged; "Ukloni datum" as a text button. | decided |
| E5 | **Priority:** Bez, Nizak, Srednji, Visok with flag icons in the G6 colors (high red, medium amber), and the note "Prioritet ne menja redosled". | decided |
| E6 | **Reminder:** quick choices "U vreme plana", "15 min pre", "1 h pre" and "Dan pre u 9:00", plus a manual date and time; a summary sentence ("Podseti me 8. okt u 13:30"); the task dates for reference; "Ukloni podsetnik". | decided |
| E7 | **Repeat:** quick choices Svaki dan, Radnim danima, Svake nedelje, Svakog meseca; frequency, "Na svakih N" (interval) and the day; a summary sentence; an end (never, on a date, after N times) whose field opens right below the choice. | decided |
| E8 | **Project:** search, "Bez projekta", the area under each project name, and the note that the task takes the project's area; "+ Novi projekat" at the bottom. | decided |
| E9 | **Tags:** search, colored dots, multiple choice, "+ Nova oznaka". | decided |

## Habits screen (Claude's proposals 1 and 2, images 11–12)

| # | Decision | Status |
| --- | --- | --- |
| H1 | **A "Dan / Nedelja" switch;** Dan is the default view when the screen opens. | decided |
| H2 | **Dan (proposal 1):** habits grouped by routine (Jutro, Dan, Veče), with the round check, frequency and streak, or "2/4 ove nedelje" for a weekly target. Done habits move to the bottom of their group. | decided |
| H3 | **Nedelja (proposal 2):** a table with the habits as rows and the days of the week as columns. Tapping a circle records today or a past day; future days and days the habit is not scheduled are inactive. A legend for done, missed, skipped and not scheduled. | decided |
| H4 | **Progress** (revised 2026-10-08, image 15): the week rings at the top of the screen, and "Napredak" with the bars and the month chart under the list. Details below the table. | decided |
| H5 | **Paused and archived habits** fold at the bottom ("Pauzirane · N") instead of the current Aktivne / Sve / Arhivirane tabs. | accepted as the basis (no objection) |
| H6 | **Numeric habits on Today and in Dan:** the circle fills with progress (e.g. 1,5 / 2 l), and a tap opens a small value sheet with quick values. | decided |
| H7 | **"Po navici · ova nedelja"** at the top of "Napredak", above the chart, in both views: the habits stacked one below another, each with its name, a count ("3/7") and a thin bar up to 100%. A bar measures the done days against the week's plan: the scheduled days, or the target of an "X puta nedeljno" habit, without skipped days. So it fills during the week. A full bar shows a small green check instead of the count. Habits in routine order. | decided |

**H4, revised 2026-10-08:**
- **Week rings at the top** of the screen, under the title and above the "Dan / Nedelja" switch, in both views and without a heading. This week's rings (image 12) show the percentage inside (the "%" sign smaller and muted); a full ring shows a small green check instead of "100%", and future days a dash. A day's percentage counts only habits scheduled that day, without skipped ones.
- **"Napredak" under the list,** in both views: the per-habit bars (H7), then a line chart for the **calendar month** with arrows (image 11) and the y axis up to 100%. Only today's value is labelled on the line, so a past month has no label; touching or hovering shows any day's value.

## New habit (image 13)

| # | Decision | Status |
| --- | --- | --- |
| N1 | **A window/panel** like the task window and Quick Add, not a full-screen page. A big "Napravi naviku" button at the bottom. | decided |
| N2 | **First screen:** name, area (optional), routine (Jutro / Dan / Veče, default Dan), tracking (Kvadratić / Brojevno, default Kvadratić), frequency (default "Svaki dan"), reminder time, and "Više". | decided |
| N3 | **Numeric tracking:** choosing "Brojevno" shows the target and unit right below (e.g. 2 l, 20 min). | accepted as the basis (no objection) |
| N4 | **Under "Više":** start, end, minimum and ideal targets, grace days, linked goals. | accepted as the basis (no objection) |
| N5 | **Segmented choices** highlight the selected option in neutral gray, like the other switches; blue is only for the main button. | accepted as the basis (no objection) |
| N6 | **The frequency sheet** works like the task repeat sheet: Svaki dan / Određeni dani / X puta nedeljno / Na svakih N dana. | accepted as the basis (no objection) |
