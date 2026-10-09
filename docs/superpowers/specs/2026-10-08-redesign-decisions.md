# Dailo redesign — design decisions

**Started:** 2026-10-08.

**Process:**
- The user sends designs one at a time, Claude reviews each one (what to keep, what to change, open questions), and the decisions are recorded here.
- Nothing is implemented until the user calls the design final.
- The mobile technology is agreed after the design; V2.0-b is on hold.
- The prototypes cited below are in `docs/design/prototipovi/` (see its README); `dailo-prototip.html` there joins every decided screen.

**Status words:**
- **decided:** the user decided;
- **proposed:** Claude proposed and the user has not answered yet;
- **open:** still to be discussed.

## Global

| # | Decision | Status |
| --- | --- | --- |
| G1 | **Phone bottom navigation:** Danas, Inbox, Zadaci, Kalendar, Navike, Još (six items). Goals and the other routes move under "Još". What "Zadaci" shows is decided in Z1–Z7; still open: whether six labels fit at 320–375 px. | decided |
| G2 | **Adding:** one floating "+" at the bottom right (as today). No "+" in screen headers. | decided |
| G3 | **Background:** neutral graphite (the current `#0F1114` family), not the navy of image 1. The user left it to Claude's recommendation: the blue accent and the red, amber and green status colors read more clearly on a neutral base. | decided |
| G4 | **Font:** Geist for now; it may change later. | decided |
| G5 | **Density:** phone rows as in image 1 (large and easy to touch); a denser variant for desktop (settled by K3 on 2026-10-09: about 44 px rows on the desktop, "Zbijeniji prikaz" on by default). | decided (2026-10-09) |
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
- **Suggestions:** the section leaves Today and goes to the top of Zadaci (Z2).

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
| E7 | **Repeat:** quick choices Svaki dan, Radnim danima, Svake nedelje, Svakog meseca; frequency, "Na svakih N" (interval) and the day; a summary sentence; an end (never, on a date, after N times) whose field opens right below the choice. Extended on 2026-10-09 by the shared repeat editor (S15). | decided; extended by S15 (decided) |
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
- **Tapping a ring opens that day in Dan,** from either view, so a forgotten habit can be marked. The selected day gets a quiet background, and the list starts with that day's name and date ("Utorak, 6. oktobar"). A past day toggles done and missed; a skipped day becomes done. Future days are inactive. Tapping today's ring returns to today, and opening the screen always starts at today.
- **"Napredak" under the list,** in both views: the per-habit bars (H7), then a line chart for the **calendar month** with arrows (image 11) and the y axis up to 100%. Only today's value is labelled on the line, so a past month has no label; touching or hovering shows any day's value.

## New habit (images 13 and 16–18)

| # | Decision | Status |
| --- | --- | --- |
| N1 | **A window/panel** like the task window and Quick Add, not a full-screen page. A big "Napravi naviku" button at the bottom. | decided |
| N2 | **First screen:** name, area (optional), routine (Jutro / Dan / Veče, default Dan), tracking (Kvadratić / Brojevno, default Kvadratić), frequency (default "Svaki dan"), reminder, and "Više". The reminder can hold several times ("+ Dodaj vreme"). Without a name, "Napravi naviku" asks for one. | decided |
| N3 | **Numeric tracking:** choosing "Brojevno" shows the target and unit right below, per day ("Cilj 2 l po danu"). | decided |
| N4 | **Under "Više"** (revised 2026-10-08): rows with "›" that open a small sheet, as in the task window. Details below the table. | decided |
| N5 | **Segmented choices** highlight the selected option in neutral gray, like the other switches; blue is only for the main button. | accepted as the basis (no objection) |
| N6 | **The frequency sheet** (images 16–18): Svaki dan / Određeni dani / X puta nedeljno / Na svakih N dana, with the habit name under the title. Details below the table. | decided |

**N4, decided 2026-10-08 (prototype `nova-navika.html`):**
- **Početak:** default Danas; the date sheet as in the task window (Danas / Sutra / Sledeće nedelje, month grid).
- **Kraj:** Nikad / Na datum / after a number of successful periods (days, or weeks for "X puta nedeljno"), like the end of a task repeat.
- **Minimalna i idealna:** only for "Brojevno" and "X puta nedeljno"; blank means the same as the target, and the ideal must be at least the minimum. For "X puta nedeljno" both count check-ins per week, as in the current app. Changing the tracking or switching to or from "X puta nedeljno" clears them.
- **Brze vrednosti:** only for "Brojevno". They are suggested from the target (2 l → +0,25 +0,5 +1; 20 min → +5 +10 +20) until the person changes them, and they appear in the value sheet (H6).
- **Povezani ciljevi:** multiple choice, like tags.
- **Moved to the habit details:** "Nastavak" (continuation) and "Dani tolerancije" (grace days) leave the new habit window. A note under "Više" says where they are.

**N6, decided 2026-10-08:**
- One "Primeni" button; X closes without a change (no "Cancel" / "Save frequency" pair).
- **Određeni dani:** seven day buttons, the working days by default, and at least one day is required.
- **X puta nedeljno:** a stepper and the note that a day counts once and the weekly target can be exceeded.
- **Na svakih N dana:** the stepper in one row ("Na svaka 3 dana"), the start date (the same date as "Početak") and the next three dates. No repeated summary sentence.

## Goals (Claude's proposal, prototype `ciljevi-predlog.html`)

| # | Decision | Status |
| --- | --- | --- |
| GO1 | **List:** the "Ciljevi" title with one summary line ("6 aktivnih · 1 u riziku · 1 kasni") instead of the "Pregled ciljeva" dashboard and the Aktivne / Sve / Arhivirane / Po mesecima tabs. | accepted as the basis (no objection) |
| GO2 | **Grouping:** a "Horizont / Rok" switch; Horizont (Kratkoročno, Srednjoročno, Dugoročno) is the default, and Rok groups by the month of the target date, with "Bez datuma" last. | decided |
| GO3 | **Goal row:** title, percentage, a thin bar and a meta line (progress such as "14 od 20 zadataka", and the date). The bar is green when on track, amber "U riziku" (the target date within seven days and progress below 75%) and red "Kasni" (the date has passed); the words appear only for those two states. | accepted as the basis (no objection) |
| GO4 | **Finished and paused goals** fold at the bottom ("Ostvareni · N", "Pauzirani · N"), as on the Habits screen (H5). | accepted as the basis (no objection) |
| GO5 | **Goal window** like the task window (D1): title and area link; a progress card with the big percentage, the bar and the goal state; Etape with round checks and "+ Dodaj etapu"; linked tasks (with checkboxes) or the habit contributions; Planiranje (Ciljni datum, Horizont, Izvor napretka, Podsetnik), Organizacija (Oblast, Povezano) and "Više opcija" (Istorija, pauza, arhiva). A manual goal has "Ažuriraj napredak" with quick values. | accepted as the basis (no objection) |
| GO6 | **"Označi kao ostvaren"** at the bottom of the goal window stays gray until the goal reaches 100% and turns blue then; "Vrati kao aktivan" for a finished goal. | decided |
| GO7 | **New goal window** like the new habit window (N1): name, area, Horizont (default Kratkoročno), Napredak (Ručno / Zadaci / Navike; Ručno offers Procenat / Broj with a target and unit), Ciljni datum (quick choices: Za mesec dana, Za 3 meseca, Kraj godine), and "Više" (Etape, Podsetnik, links). The floating "+" on this screen opens it. | accepted as the basis (no objection) |

## More ("Još") and Settings (images 19–20, prototype `jos-podesavanja.html`)

| # | Decision | Status |
| --- | --- | --- |
| M1 | **Projects and "Bilo kad" (Anytime) live under "Zadaci",** not under "Još" (part of the open G1 question about what "Zadaci" shows). | decided |
| M2 | **Notes and Resources stay** in the app, under "Još". | decided |
| M3 | **The "Today cards" and "Default Today filter" settings are removed:** the simpler Today (T2) has nothing for them to choose. | decided |
| M4 | **"Još" groups as cards:** Zakačeno (pinned areas and saved views as ordinary rows, without the amber pin), Planiranje (Ciljevi, Oblasti, Čišćenje — renamed "Redovne obaveze" in S4 — Nedeljni pregled), Biblioteka (Beleške, Resursi, Oznake, Šabloni, Sačuvani prikazi), Arhiva (Završeni zadaci, Arhivirani projekti), and Podešavanja with the sync state underneath. Upcoming moved to the Calendar (C9), Search is on Today (T1). The active bottom item uses the light-blue icon and label, not a filled blue background. | decided |
| M5 | **Settings groups:** Nalog (Sinhronizacija); Opšte (Prvi dan nedelje, Dnevni kapacitet, Podsetnici); Podaci (Rezervna kopija with the backup reminder inside, Vrati iz kopije, Lokalni snimci, Trajno čuvanje, Popuni primerima, Resetuj aplikaciju in red); Pomoć (Uputstvo, Prijavi problem, Instaliraj aplikaciju while not installed, Privatnost, O aplikaciji with the version). Keyboard shortcuts and compact density only on desktop. "‹ Još" at the top left. | decided |
| M6 | **Settings that leave:** "Izgled / Tema" (dark is the only theme), "Today summary" (the simpler Today has no summary strip), and "Obriši završene zadatke" moves to the Završeni zadaci screen. | decided |

## Tasks ("Zadaci", Claude's proposal, prototype `zadaci-predlog.html`)

| # | Decision | Status |
| --- | --- | --- |
| Z1 | **Screen top:** the "Zadaci" title with a search icon and one summary line ("14 otvorenih · 4 projekta"), then a "Kad stignem / Projekti" switch. "Kad stignem" is the default view. | decided |
| Z2 | **"Predlozi za danas"** (the suggestions that left Today, T2a) sit at the top of Zadaci as a folded card with the count. The rules stay as today: due today, missed plan, due tomorrow, due within seven days. Each row has "+ Danas", and the card ends with "Dodaj sve u Danas". | decided |
| Z3 | **"Bilo kad" is renamed "Kad stignem"** everywhere in the app (the Serbian label of Anytime, today "Bilo kada"). It holds sorted, open tasks without a plan date; a due date may exist. | decided |
| Z4 | **Inbox stays a separate place** in the bottom navigation, for everything captured and not yet sorted (tasks, goals, habits, notes, resources). "Kad stignem" is sorted work waiting for a day and is never emptied like Inbox. | decided |
| Z5 | **Kad stignem view:** the tasks grouped by project ("Bez projekta" first), in the Today row style (T3). | accepted as the basis (no objection) |
| Z6 | **Projekti view:** a "Bez projekta" row on top, then the projects **grouped by area**; each row has the project color dot, the open count, the nearest due date in the G6 colors and a thin bar of done tasks; "+ Novi projekat" at the end. | decided (grouping); accepted as the basis (row) |
| Z7 | **Project screen:** "‹ Zadaci", color, name, area, open and done counts, the linked goal ("Cilj: …"); open tasks, "+ Dodaj zadatak", done tasks folded at the bottom; "⋯" with Preimenuj i boja, Oblast, Povezani cilj, Sačuvaj kao šablon, Arhiviraj, Obriši. The floating "+" adds a task to the open project. | accepted as the basis (no objection) |

## Inbox (Claude's proposal, prototype `inbox-predlog.html`)

| # | Decision | Status |
| --- | --- | --- |
| I1 | **Screen top:** the "Inbox" title and one line ("8 stavki čeka razvrstavanje"); the Inbox item in the bottom navigation shows the count in a small gray badge (not red, to avoid pressure). | decided |
| I2 | **"Razvrstaj redom"** opens one item at a time in a sheet with large buttons: for a task Danas, Sutra, Kad stignem, Projekat…; for a note, resource, goal or habit Otvori, Oblast…, Razvrstano. "Preskoči", a counter ("3 od 6"), and "Gotovo" at the end. Deleting is not offered here; it stays in the task window. | decided |
| I3 | **Filters** (Sve, Zadaci, Beleške, …) show only the types present in Inbox, with counts, instead of always six tabs. | accepted as the basis (no objection) |
| I4 | **Groups by capture time** stay: Danas, Juče, Ove nedelje, Ranije. | accepted as the basis (no objection) |
| I5 | **Quick buttons under every row stay:** a task gets Danas / Sutra / Kad stignem / Projekat…; another item gets Otvori / Oblast… / Razvrstano. "Ukloni" is renamed "Razvrstano", because it only takes the item out of Inbox. A new "Oblast…" sorts a non-task item into an area. | decided |
| I6 | **Every sorting action** shows a message with "Poništi". An empty Inbox shows a check and "Sve je razvrstano". | accepted as the basis (no objection) |

## Smaller screens (Claude's proposal, 2026-10-09, in `dailo-prototip.html`)

Built from an inventory of the current screens, so no feature is dropped. All open from "Još" except Search (the magnifier), Focus (the task window menu) and Habit details (the habit menu).

| # | Proposal | Status |
| --- | --- | --- |
| S1 | **Oblasti:** rows with the area icon and color, the name and "2 projekta · 10 otvorenih · 1 cilj"; archived areas fold at the bottom with "Vrati" instead of the Sve / Aktivno / Arhivirano tabs; "+ Nova oblast" (name, color, icon; a duplicate name is rejected). | decided (2026-10-09) |
| S2 | **One area:** a summary line instead of the six number cards; sections Projekti, Zadaci (5, then "Prikaži još"), Ciljevi, Navike and Beleške i resursi, each with "+"; "⋯" with Izmeni, Zakači u „Još“, Arhiviraj and Obriši. An empty section keeps only its header and "+", with no "nothing here" sentence; a completely empty area shows one line pointing to the "+" buttons. | decided (2026-10-09) |
| S3 | **Beleške and Resursi:** one list, newest first, with a star; filter chips (Omiljeno, Oblast, Oznaka; resources also Vrsta and Status) and "Obriši filtere". An item opens in a window like the task window: area, (resource: type, reading status, author, last review), text, clipped text, links, tags, linked items, attachments; star and "⋯" (delete) in the header; changes save at once. A note needs only a title, so a text-only note is allowed (decided 2026-10-09); a resource still needs at least one link, image or file. Notes and resources stay **two screens** (resources have their own filters, Vrsta and Status), and only resources link to tasks, projects, goals and habits, as today; notes get no links (decided 2026-10-09). | decided (2026-10-09) |
| S4 | **"Čišćenje" becomes "Redovne obaveze"** (decided 2026-10-09) and shows **everything that repeats** (decided): groups first (rooms become general groups such as Dnevna soba, Kupatilo, Auto, Bašta), then the repeating tasks of projects under their project, then "Bez grupe". Group chips plus "Iz projekata" and "+ Grupa"; a round check completes a task and schedules the next one; "+ Dodaj obavezu" per group (name, group, start day and the repeat editor, S15); done ones fold per section; the apartment and house examples stay in the empty state. Groups do not appear in Zadaci → Projekti. | decided (name and scope); layout proposed |
| S5 | **Nedeljni pregled:** six numbered steps on **one screen** (not step by step; decided 2026-10-09); steps 1 and 2 turn into a green check when empty and then fold into their header line ("· gotovo"); step 3 rows open that day in the Calendar (Predstojeće moved there, C9) and show only what is there ("3 u planu · 1 rok"), an empty day reads "Slobodno"; "Završi nedeljni pregled" and the earlier reviews. At the top, one small chart (asked for and decided 2026-10-09): a "Poslednjih 7 dana" card (rolling, since the review can happen before Sunday) with completed tasks per day as seven columns (one series, no legend, a tap shows that day's count under the chart, each column has a spoken label) and three numbers: Završeno (with the change against the previous 7 days), Stiglo (new tasks) and Navike (percent done this week). Nothing more: habits and goals keep their own progress views. | decided (2026-10-09) |
| S6 | **Oznake:** a list that counts tasks and library items ("1 zadatak · 1 u biblioteci", or "Nije u upotrebi"); a tag screen with its active tasks and, new, the notes and resources with that tag (completed tasks are not shown there: they stay in Završeni zadaci); "⋯" edit and delete (with Undo). | decided (2026-10-09) |
| S7 | **Šabloni:** grouped by type instead of tabs; a tap opens "Upotrebi šablon" (the usual new-item window, already filled), Izmeni, Dupliraj, Obriši. Saving a template stays in the item menus ("Sačuvaj kao šablon"), and "+ Novi šablon" stays on the screen. New: Quick Add has an "Iz šablona" chip for task templates; it fills the title (unless the user already typed one), the plan day, the due offset, the subtasks and the tags, shows the template's summary under the chip, and "✕" removes it; a date, project or title the user types or picks still wins (decided 2026-10-09). | decided (2026-10-09) |
| S8 | **Sačuvani prikazi:** rows with type, "zakačen" and the filter summary; a result screen; "⋯" with Izmeni, Dupliraj, Zakači u „Još“, Obriši; the edit window has the type switch and one row per filter; pinned views appear under "Zakačeno" in "Još". Each list row also shows how many items the view has now. Types stay tasks, goals and habits (no notes or resources; decided 2026-10-09). | decided (2026-10-09) |
| S9 | **Završeni zadaci:** project and period chips, groups by day, the checkbox restores with Undo, and "Obriši završene zadatke" at the bottom with a confirmation (M6). It removes all completed tasks, as the app does today, with no "older than 30 days" choice (decided 2026-10-09). | decided (2026-10-09) |
| S10 | **Arhivirani projekti:** rows with "Vrati"; archiving from the project menu; tasks of an archived project leave every list until it is restored. An archived project opens read-only: a notice "Arhiviran projekat" with "Vrati" at the top, no "+ Dodaj zadatak", and the "+" explains that it must be restored first. Deleting stays in the project menu only, not in this list (decided 2026-10-09). | decided (2026-10-09) |
| S11 | **Pretraga:** a full-height window with the field on top. Scope, ranking and grouping stay exactly as today (tasks by title and notes, completed included; projects by name, archived included), as the compatibility rules require. The user does not want a wider search (2026-10-09). | decided |
| S12 | **Fokus:** from the task window menu ("Započni fokus"); today's count-up timer with Pauziraj / Resetuj, the subtasks, which can be ticked here (today they are read-only), the notes, and Sutra / Sledeći / Detalji / Završi zadatak. | decided |
| S13 | **Detalji navike:** a window from the habit menu: today's check and "Preskoči danas", four numbers (current streak, longest streak, total check-ins, this week), the month calendar where a tap on a past day edits the history, an "Uvid" card (week, period target, recovery), the settings rows (routine, tracking, frequency, reminders, minimum and ideal, grace days, continuation, end, linked goals), "⋯" (template, snooze, archive, delete) and "Pauziraj naviku" at the bottom. No extra chart: the Habits screen has Napredak and this window has the month calendar (decided 2026-10-09). | decided (2026-10-09) |
| S14 | **Repeating tasks** create their next occurrence when completed anywhere (Today, Calendar, Redovne obaveze), as the app does today; the message says when it comes next and has "Poništi". The app's controls stay, at the bottom of the "Ponavljanje" sheet and only for a task that already repeats: "Preskoči sledeći put" (completing then skips one occurrence; tapping again cancels it), "Pauziraj ponavljanje" / "Nastavi ponavljanje" (while paused, completing creates no next one and the rule reads "· pauzirano") and "Završi ponavljanje" (this task stays, no more are created); each with "Poništi". The "Samo ovo / Ovo i buduća" question stays, but **only for a change of the date or the repeat** (in the task window, by dragging in the calendar, and with "+ Danas"); the title, notes and other fields save without asking, where the app asks today for any change. "Samo ovo" keeps the rule on its old day; "Ovo i buduća" moves the rule's day along. | decided (2026-10-09) |
| S15 | **Repeat editor** (the user's request of 2026-10-09: every Monday, or Wednesday and Saturday; once a month; every 10th of the month; every 3 months). One editor serves the task window's "Ponavljanje" (E7) and the "Nova redovna obaveza" window. Quick choices: Svaki dan, Svake nedelje, Svakog meseca, Na 3 meseca, Svake godine. Dnevno / Nedeljno / Mesečno / Godišnje with a "Razmak" stepper (every N days, weeks, months or years). Nedeljno picks any weekdays (at least one; Mon–Fri reads "Radnim danima"). Mesečno is either "Dan u mesecu" (1–31 or "Poslednji dan"; 29–31 fall on the last day of shorter months) or "Dan u nedelji" (prvi … četvrti or poslednji, plus a weekday, e.g. the first Monday; kept at the user's request). Godišnje repeats the start date. Below: the sentence ("Sredom i subotom", "Svakog 10. u mesecu", "Na svaka 3 meseca, 10. u mesecu"), the next three dates, and Kraj (Nikad, Na datum, Posle broja ponavljanja); after the end, completing creates no next one. The new recurring-task window (tall) asks for the name, the group and "Počinje" (Danas, Sutra, Sledeće nedelje or a date); the first time is the first matching day from the start. | decided (2026-10-09) |

**S15 needs a data-model change at implementation time.** The app's rule (`normalizeRecurrence` in `js/core.js`) knows only `daily | weekly | monthly` with `interval`, plus the V3 end fields (`endType` never, date or afterOccurrences). It has no weekday list, no day-of-month or last-day choice, no nth weekday and no yearly frequency; weekly adds 7 × interval days and monthly keeps the day of the month. The extension (weekdays, month mode with day or last day, nth weekday, yearly) must stay backward compatible: a rule without the new fields keeps today's behavior, and backup validation accepts both shapes. It gets its own versioned spec and a failing test first.

## Desktop (Claude's proposal, 2026-10-09, `dailo-racunar.html`)

The desktop prototype is built from the same parts as `dailo-prototip.html` plus `zbirni/60-desktop.css` and `60-desktop.js`, so both share data and behavior. Frame: 1280 × 800.

| # | Proposal | Status |
| --- | --- | --- |
| K1 | **Sidebar instead of the bottom navigation and "Još":** brand and sync state; Pretraga (/); Danas with its count and, right under it, a "Prevuci ovde za sutra" drop zone (moved there from below Navike at the user's request, 2026-10-09); Inbox with the badge, Zadaci, Kalendar, Navike; Zakačeno; Projekti grouped by area, with open counts; Planiranje, Biblioteka and Arhiva as in "Još" (M4); Podešavanja at the bottom. Screens opened from the sidebar have no back button. Adding stays with the floating "+" at the bottom right (decided 2026-10-09, see K12). Planiranje, Biblioteka and Arhiva fold on their title (the app remembers it per device; a folded group still shows the open screen), while Zakačeno and Projekti stay open. A button at the top and the "[" key shrink the sidebar to a 60 px strip of icons with tooltips and the Inbox badge, giving the content the width (decided 2026-10-09). | decided (2026-10-09) |
| K2 | **Content width:** lists stay in a centered column of at most 760 px; the calendar week and month use the full width. | decided (2026-10-09) |
| K3 | **Density (G5):** rows of about 44 px and 14 px text, with a hover background. Settings → Računar → "Zbijeniji prikaz" (on by default) brings back the phone sizes when turned off. | decided (2026-10-09) |
| K4 | **Every window is a centered dialog** over a dimmed screen (decided 2026-10-09; the right-hand panel was not chosen): the task, goal, habit and note windows, new habit, new goal and focus are tall (640 px wide); Quick Add, Search, Razvrstaj redom and saved view editing are short (560 px); the new recurring task is tall since it holds the repeat editor (S15). Esc closes. On the phone they stay bottom windows (D1). | decided |
| K6 | **Pickers are popovers next to the row** that opened them (E2). The repeat editor (S15) is too long for a popover and opens as a centered window (440 px) instead (decided 2026-10-09). | decided (2026-10-09) |
| K7 | **Two columns where there is room:** Today has tasks on the left and habits on the right; Habits has the list on the left and Napredak on the right. On a narrow window they fall back to one column. | decided (2026-10-09) |
| K8 | **Calendar:** Nedelja is 7 columns (C3) with cards (time and duration), dashed goal and milestone deadlines, "+ Dodaj" per day and a thin load bar per day against the daily capacity. Mesec shows up to 3 titles per day and "+N još" (the phone shows only dots, C1; titles decided 2026-10-09), with the selected day's list below. Predstojeće is the phone list. The week keeps **cards, no hour grid** (decided 2026-10-09); a click on a column's date selects that day and shows it below the week, where "Lista / Raspored" (C6) gives the hours. A "Danas" button sits next to the arrows. Tasks of archived projects stay out of the calendar (S10). | decided (2026-10-09) |
| K9 | **Drag and drop:** any task row or card onto a calendar day, onto Danas or "Sutra" in the sidebar, or onto a project in the sidebar; the message offers Undo. Moving a repeating task asks "Samo ovo / Ovo i buduća" first (S14). | decided (2026-10-09) |
| K10 | **Keyboard:** Q new item, / search, Esc closes, 1–5 the main screens; shortcuts stay editable (Settings → Računar → Prečice na tastaturi). Also "[" for the sidebar (K1) and, in the Calendar, ← → for the previous or next week or month and T for today (decided 2026-10-09). | decided (2026-10-09) |
| K11 | **Settings → Računar:** "Prečice na tastaturi" and "Zbijeniji prikaz", only on the desktop (M5). | decided (2026-10-09) |
| K12 | **The floating "+" stays on the desktop** at the bottom right of the content (decided 2026-10-09, not a sidebar button). It adds what belongs to the screen, and its label says what (e.g. "Nova navika"); Q does the same. | decided |
