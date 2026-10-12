# Redesign R47 — the desktop layer (K1–K12)

**Date:** 2026-10-12 · **Status:** point 3 of the next-steps list ("moze 1 i 3": "Izgled za računar: široki ekran sa bočnim menijem"). · **Decisions:** K1–K12 in `docs/superpowers/specs/2026-10-08-redesign-decisions.md` (decided 2026-10-09, deferred until now).

The layer applies only from 1024 px on. Below that the phone design stays exactly as it is. Nothing in the data model changes. The only new device-local keys are `dailoSidebar` and `dailoSidebarFolds`, which live outside state and backups.

## Steps

| Step | Release | Decisions |
| --- | --- | --- |
| R47a | `2.0.0-alpha.73` | K1 sidebar, K2 widths, K10 keys, K12 labelled "+" |
| R47b | `2.0.0-alpha.74` | K4 centered windows, K6 pickers next to their row, K3 hover |
| R47c | next | K7 two columns on Danas and Navike |
| R47d | next | K8 calendar week and month, K9 drag and drop onto the sidebar |

K5 is not used in the decision log. K11 (Settings → Računar with "Prečice na tastaturi" and "Zbijeniji prikaz", shown only on wide screens) already exists since R10g and R34.

## R47a — the sidebar, widths, keys and the "+"

### The sidebar (K1)

- **Placement:** `index.html` has `<aside id="desktop-sidebar">` before `<main>`. From 1024 px on the shell is a grid of `var(--sidebar-width)` (264 px) and the content, and the bottom bar is hidden. Below 1024 px the sidebar is hidden.
- **What `renderSidebar()` draws (on every `renderView`):**
  - **Top:** the brand and the fold button.
  - **Sync line:** "Podaci su samo na ovom uređaju", "Nema prijave na nalog", "Sinhronizacija u toku…", "Sinhronizovano HH:MM" or the account e-mail.
  - **Main items:** Pretraga with its `/` key; Danas with its count (overdue + today); a "Prevuci ovde za sutra" drop zone (`data-sidebar-drop="tomorrow"`, wired in R47d); Inbox with its badge; Zadaci, Kalendar and Navike.
  - **Zakačeno:** pinned areas, pinned saved views and up to four starred notes. It is hidden when empty.
  - **Projekti:** grouped by area, sorted by the area's name (`sidebarProjectGroups`), then "Bez oblasti". Each project shows its open count; archived projects and the cleaning room are left out.
  - **Groups from "Još":** Planiranje, Biblioteka and Arhiva, the same screens as on "Još".
  - **Bottom:** Podešavanja and Nalog.
- **Active item:** the item of the open screen is marked with `aria-current="page"`. A screen under a main item (a project under Zadaci, a day under Kalendar) lights that item, like the bottom bar does.
- **Folding groups:** Planiranje, Biblioteka and Arhiva fold on their title, remembered in `dailoSidebarFolds`. A folded group still shows the open screen. Zakačeno and Projekti do not fold.
- **Folding the sidebar:** the button at the top or "[" shrinks the sidebar to a 60 px strip of icons. Every item keeps its name as a tooltip, and the Inbox badge stays. The choice is remembered in `dailoSidebar` and applied before the first paint by `js/appearance.js`.
- **No "‹ Još" back link:** screens reached from the sidebar need none, so the topbar whose only content is that link is hidden on wide screens. Other back links (a project to Zadaci, a tag to Oznake) stay.
- **Focus:** it survives a redraw of the sidebar like it does in the main view (`focusDescriptor` regions).

### Widths (K2)

Lists keep their centered column of at most 760 px (since R1). The calendar keeps its own width (up to 1200 px). The content gets more room only because the sidebar replaces the bottom bar.

### Keys (K10)

These keys work only when no text field has focus. They are fixed, on top of the editable shortcuts:

| Key | Action |
| --- | --- |
| 1–5 | Danas, Inbox, Zadaci, Kalendar, Navike |
| `[` | Folds the sidebar (wide screens only) |
| ← → in Kalendar | Previous or next week, month or day, like the arrows |
| T in Kalendar | Selects today; elsewhere T still opens Danas |

K10's "Q new item" stays the editable "Novi zadatak" shortcut (default N), so existing settings do not change.

### The "+" (K12)

- **Wide screens:** the floating "+" sits at the bottom right of the content as a pill with a label: "Novi zadatak", or what the screen adds ("Nova navika", "Novi cilj", …). It never opens the phone's "+" menu; where the screen has nothing of its own it opens Quick Add for a task. The Novi zadatak shortcut does the same.
- **Phones:** unchanged.

## Checks (R47a)

- **Node:** `tests/redesign-r47a.test.js`, written first; it failed 8/8. It covers:
  - the markup;
  - the sidebar's parts;
  - projects by area;
  - the CSS from 1024 px on and the folded width;
  - the "+" and its label;
  - the keys;
  - the Serbian strings;
  - the version.
- **Updated tests:** the tests of R1, R9c, R10g, R22c and V1.8 that required "no sidebar" now allow this one.
- **Smoke:** `tools/smoke-boot.mjs` checks the sidebar in jsdom: it is drawn, a group folds, the sidebar folds, and an item navigates.
- **Manual-pending:** the look on a real wide screen (Mac browser) and the keys.

## R47b — centered windows, pickers next to their row, hover

### Windows (K4)

- **Placement:** from 1024 px on, every window is a dialog in the middle of the dimmed screen, with rounded corners all around. On a phone it stays a bottom window (D1).
- **Widths:**
  - **Tall (640 px):** the task, goal, habit and note windows, the new habit, the new goal, the new recurring task, Fokus, the journal entry and the template editor.
  - **Short (560 px):** Quick Add, Pretraga, Razvrstaj redom, the saved view window and the small windows.
  - **Confirm:** 480 px.
- **Height:** at most the window height minus 64 px; longer content scrolls inside, and the sticky footers stay.
- **Welcome screen:** it stays full-screen.
- **Esc:** closes a window, as before.

### Pickers (K6)

- **Next to the row:** on a wide screen a picker (`openPopover`) opens as a 380 px popover next to the row or button that opened it.
  - **Where (`anchoredPopoverPosition`):** under the row when it fits. Otherwise it goes above the row, or, when neither side has room, it is shifted to fit the window.
  - **Alignment:** a row wider than the picker (a row in the task window) lines it up with the value on the right; a smaller control lines up its left edge.
  - **Edges:** the picker always stays 12 px inside the window. A picker taller than the window scrolls inside.
- **Centered pickers:** the repeat editor (S15) is too long for a popover and opens as a 440 px centered window over the dimmed screen. A picker whose row is not on the screen opens the same way.
- **Redraws:** when the picker's content is redrawn (`refreshSheet`, `setPopoverContent`) it is placed again. If the row itself was redrawn, the remembered place is kept.
- **Backdrop:** behind a popover it is clear, and a click on it still closes the picker. The page under it does not scroll.
- **What does not change:**
  - a change of the window width still closes the picker;
  - the grabber is hidden, and dragging the header does nothing on a wide screen;
  - on a phone every picker stays a bottom sheet.

### Hover (K3)

- **Rows:** with a mouse on a wide screen, list rows get the hover background that task and project rows already had: Danas and habit rows, goals, areas, tags, saved views, journal, review and archived chores.
- **Already there:** the 44 px rows and 14 px text come from the density setting (R34, Settings → Računar → "Zbijeniji prikaz").

## Checks (R47b)

- **Node:** `tests/redesign-r47b.test.js`, written first; it failed 6/6. It covers:
  - the window CSS and widths;
  - the six positioning cases;
  - `placePopover` (anchored, kept after a redraw, centered for the repeat editor and without a row, untouched on a phone);
  - the wiring;
  - hover;
  - the version.
- **Smoke:** with a wide `matchMedia`, a task's ⋯ menu opens next to its button over a clear backdrop.
- **Manual-pending:** the look and the placement in a real wide browser window.
