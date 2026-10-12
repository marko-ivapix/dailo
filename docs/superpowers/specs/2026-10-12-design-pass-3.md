# Third design pass — findings, decisions and steps R30–R39

**Date:** 2026-10-12 · **Status:** the user asked "da li mozes da prodjes kroz ceo dizajn opet". Four read-only reviews were run in jsdom with "Popuni primerima" loaded, and their source was read. The reply listed 21 fixes, 12 additions (A–L) and 4 questions, and the user answered "moze sve". · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md`, rows R30–R39.

## Decisions taken from "moze sve"

1. **Važno / Hitno:**
   - **The switches leave the task window.** They had no visible effect anywhere.
   - **The stored fields stay.** They remain in state, sync and backups, and nothing is deleted.
2. **First run:**
   - **The examples stay.** A new workspace still starts with them.
   - **Danas says so.** The screen shows an "Ovo su primeri" card with two choices:
     - **Počni prazno:** removes only the untouched examples, with Poništi.
     - **Zadrži:** hides the card.
   - **No late task on day one.** The example set no longer starts with a late task.
3. **"Bucket lista" stays.** It is the user's own word.
4. **Light theme (addition L): yes.** It reopens decision M6 (dark only) and comes last, after the colors are tokens (R34).

## Findings (file references at the time of the review)

## Bugs (verified)
1. Project picker (app.js:2273 openProjectPicker, sortedProjects) offers cleaning rooms; a task moved there vanishes (Zadaci hides isCleaningRoom groups app.js:1290,1323; Core.deriveAnytime counts it; Redovne obaveze shows only repeating).
2. addAllSuggestions (app.js:3730) — no Undo, skips repeat scope question (requestTaskEdit used by single "+ Danas").
3. Core.parseQuickAdd: "sutra 18h" → duration 1080, no time; "sutra u 18h" → title keeps "sutra u"; "za 30 min" leaves "za"; preview shows "1080 min" (app.js:1919) not durationLabel.
4. formatDate (app.js:48-49,171) never shows the year → long goals look due today. Add year when ≠ current year.
5. First run: createSampleState (app.js:290-330, :506) freelance sample with overdue task on day one; no "these are examples" card; untouchedSample() fingerprint exists.
6. Inbox "Projekat… → Bez projekta" no-op (setProject app.js:3037 sets isInbox false only with id; clears areaId).
7. Reminder sheet default = plannedDate||today at morning time even when past (app.js:2535, 2547-2553); fires at once; "Danas" capitalised mid-sentence (2545, 5215).
8. deriveTodaySections (core.js:206-219): due-today unplanned + yesterday's unfinished plan only in suggestions (in Zadaci fold) — add "Predlozi za danas · N ›" row on Danas.
9. ROOT_ROUTES (app.js:942) lacks '#habits' (bottom tab); QUICK_ADD_DIRECT (app.js:113) lacks '#habits' → general menu, habit gets isInbox true (habits-ui.js:988→765).
10. Numeric habits: no skip (habits-ui.js:105, 381; Core.habitStatusForDate core.js:1236 ignores status for numeric); value sheet focuses input (app.js:1419) and chip only edits sheet total (habits-ui.js:978) — lost on close.
11. Calendar Raspored uses Core.daySchedule only (planned tasks); Lista uses calendarDayItems (due-only + goal/milestone deadlines). Hour grid 06–24 fixed (core.js:1006), overlaps drawn on top, no scroll to now.
12. Plurals: "{current} of {target} tasks" / "{current} / {target} tasks" use tr (i18n-sr 725, 168) → "0 od 3 zadataka"; habit contribution "0 / 60 Unosi" (goals-ui.js:165). "None" → "Nijedno" everywhere (i18n-sr 1572).
13. R29 wording: "Spakuj: …" colon+nominative; "Dobij depozit nazad…"; "112 … poziva policiju"; "Pozovi roditelje ili prijatelja" (gender); "Kapa…"; "Leti balonom". v1 examples: "No-nut", "Balzam za bradu" ×2, todoist resource.
14. Milestones after target date accepted (goals-ui.js:373, 505-515), rows not sorted by date. Goal window empty parts: "Zadaci · 0 otvorenih" empty card, "Etape · 0/0", health text without date.
15. Past calendar days: completed tasks hidden (core.js:372), "+" plans in the past.

## Look and consistency
16. Content scrolls under the status bar (only .app-shell padding-top; black-translucent; contentInset never) → fixed opaque top strip, no blur.
17. No "‹ Još" on screens under Još (Podešavanja, Nalog, Ciljevi, Oblasti, Beleške, Resursi, Oznake, Šabloni, Sačuvani prikazi, Redovne obaveze, Pregled, Dnevnik, Završeni, Arhivirani). Android Back = history.back but tabs/backLinks push hashes → piles up; tabs should replaceState, Back on non-Today tab → Today.
18. Settings like a desktop form: 11 px descriptions (css:1290), rows without vertical padding (419,1288,2100), button rows squeeze at 320–390; jargon "Snimak za oporavak: Nema", "Provera: Još nije provereno"; state buttons "Uključeno/Blokirano/Nedostupno" (app.js:745, settings-ui.js:20). Podsetnici as own group.
19. Density setting written inline on <html> (app.js:1027-1029) overrides phone :root values; compactDensity syncs from desktop.
20. Contrast: --ink-4 #6B727D as text 3.7:1 (.task-window-row-value, .quick-more-meta, .task-window-more-meta, .sheet-calendar-weekday, .day-grid-label); placeholder #687281 3.5:1.
21. Phone typography: task title 14 px (css:1389), meta 11 px (css:1733), Danas title 20 px (css:1657); prototype 30 px h1, 12.5 px meta, 58 px rows.
22. Task window: title single-line input (tasks-ui.js:85) → auto-growing textarea; "Više opcija" Oblast native select (tasks-ui.js:96), Ciljevi raw 12 px checkboxes (css:1310,1311,1367), caret rotate rule dead (css:520); Važno/Hitno no visible effect (only dead row branch tasks-ui.js:41-42) — ask user.
23. Template editor old long form (templates-ui.js:93-110), old frequency select loses R11a weekdays; row text repeats name (templateDetail line 28).
24. Habits Nedelja names max-width 64 px (css:3045); radio circle left in radioOption (habits-ui.js:527, app.js:2602) vs right elsewhere; numbers grouped vs plainNumber useGrouping false (habits-ui.js:297).
25. Example areas all same icon/color (habits-ui.js:802 areaDefaults) — use AREA_ICONS + PROJECT_COLORS; "+" on #areas / area screen ignores area (QUICK_ADD_DIRECT, routeQuickAddContext app.js:4959; knowledge.js:329).
26. Knowledge window attachments old .detail-heading (knowledge.js:247 vs tasks-ui.js:94); journal entry ⋯ skips menuSheet (journal-ui.js:235); area icon buttons same aria name (areas-ui.js:73); note textarea doesn't grow (knowledge.js:241, css:2678).
27. Resource link sheets list all 63 tasks incl. completed, no search (knowledge.js:267-268).
28. Toasts announced twice (#toast-root assertive + #global-status, renderToast app.js:3698); stacked toasts cover "+" (fixed 64 px, css:2235).
29. Sheet grabber not draggable (decorateSheet app.js:2779).
30. Android theme DayNight without windowBackground (styles.xml:13-17) → possible light strips.
31. Install row gives Safari steps everywhere (settings-ui.js:93), no beforeinstallprompt.
32. Icons: flag = priority and = due (app.js:1918, 2763); preview priority ph-arrow-fat-up (1925); Bez projekta uses tray icon (1308).
33. Fokus → Detalji drops session (app.js:1500, 5040) → returnTo.
34. Task ⋯ menu 11 entries, repeats window rows, move actions on completed tasks (app.js:2758-2765).
35. Controls < 44 px: .inline-add 38 (css:1393), "Prikaži još" 40 (2278), folds 40 (338); subtasks no touch reorder.
36. Kad stignem unsorted (deriveAnytime); Inbox drag across capture groups.
37. Weekly review tile shows no status (app.js:1247) — prototype shows "Završen / Poslednji 5. okt".

## Cleanup
38. Dead CSS ≈ 834/2455 rules (256 classes), 56 sidebar on purpose; tests/design-v1-8.test.js pins some (128,155,193,268). .main ×11, :root ×7; 37 hex + 48 rgba outside :root; 470 px font sizes in 21 sizes; sheet radii 18 vs --radius-lg; scrim .55/.66/.68; vh vs dvh. Dead JS: renderHabitRow/habitProgressLabel (habits-ui.js:40-57), renderGoalRow (goals-ui.js:16-22), old task row branch (tasks-ui.js:33-59), actions habit-checkin/skip/quick-add (habits-ui.js:993-995).

## Additions proposed
A. Own search on Beleške/Resursi (global Search unchanged) + filter sheets list used tags/areas only + searchable link sheets.
B. Note → task ("Napravi zadatak"; bullet list → subtasks).
C. Faster capture: "Dodaj i nastavi", "Dodato u Inbox · Otvori" toast, inline add row on Inbox, long-press "+" = new task.
D. Habits: one-tap quick values with Undo, partial arcs in Nedelja, "Juče nije zabeleženo: N" until noon.
E. Goal progress from milestones (data-model spec: progressMode 'milestones').
F. Calendar: upcoming repeats in Mesec/Predstojeće (Core.upcomingRecurrenceDates core.js:533).
G. Triage "Datum…" + "Otvori"; date chips "Vikend", "Večeras"; reminder "Za 1 h".
H. Share a link → resource; open a resource link from its row; show host.
I. Pin a note to Još; weekly review tile status.
J. Text size (needs font tokens), test reminder, data health line.
K. One-time gesture hint.
L. Light theme / follow system (reopens M6; needs colour tokens first).

## Steps

| Step | Version | Content |
| --- | --- | --- |
| R30 | `2.0.0-alpha.56` | Bugs, tasks side: 1, 2, 3, 5, 6, 7, 8 |
| R31 | `2.0.0-alpha.57` | Bugs, planning side: 4, 9, 10, 11, 12, 13, 14, 15 |
| R32 | `2.0.0-alpha.58` | The shell: 16, 17, 18, 20, 21, 28, 30, 31, 37 |
| R33 | `2.0.0-alpha.59` | Windows and screens: 22–27, 29, 32–36 |
| R34 | `2.0.0-alpha.60` | Cleanup: 19 and 38 (dead CSS and JS, colour and font tokens) |
| R35 | `2.0.0-alpha.61` | Additions A, B, H, I (Biblioteka) |
| R36 | `2.0.0-alpha.62` | Additions C, G, K (capture and triage) |
| R37 | `2.0.0-alpha.63` | Additions D, F, J (habits, calendar, settings) |
| R38 | `2.0.0-alpha.64` | Addition E: goal progress from milestones (own data-model note) |
| R39 | `2.0.0-alpha.65` | Addition L: light theme and "Prati sistem" |

Each step is a release that follows the usual rules:
- tests fail first;
- `npm run verify` and `npm run smoke` pass;
- it has a row in the ledger;
- visual and device checks stay with the user.
