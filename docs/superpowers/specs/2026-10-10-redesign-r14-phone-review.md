# Redesign R14 — the first phone review (design)

**Date:** 2026-10-10 · **Status:** the user's review of `2.0.0-alpha.34` on an Android phone (GitHub Pages, two screenshots of Danas), the same day; it amends T1, T3, T6, G2 and the R3 task window of `2026-10-08-redesign-decisions.md` · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.35`.

The user's words: "Pretraga treba da bude gore desno i kao dugme. Ne treba da se prikazuje ovo za nedeljni pregled. Rok treba da bude ispod ili u sredini kartice, a checkbox skroz desno. Treba da se ulepša kada se otvori pop-up za dodavanje (floating button)."

A second message the same hour, with screenshots of the task window and Inbox: "Treba da se srede taskovi koji nemaju dodeljeno. Kada kliknem da uredim neki task on mi odmah otvara tastaturu i da menjam naziv. Kada kliknem da emituje task treba samo da mi otvori modal pa cu ja da kliknem gde treba. Polje za naziv treba uvek da ima neki border, kad je aktivan treba da bude plav (kao sada)."

## What changes

1. **Search at the top right, as a button (T1).**
   - **The cause:** on phones (≤ 700 px) an older V1.x rule stacked every screen header (`.page-header { flex-direction: column }`). The search icon therefore fell into its own row under the title.
   - **The fix:** every header stays one row at every width. The title block is on the left, and the actions sit on the right, vertically centered on it.
   - **The look:** header icon buttons (search and the ⋯ menus) are visible buttons: 44 × 44, a raised graphite background, a thin border and rounded corners.
2. **No weekly review notice on Today (T6 amended).**
   - "Vreme je za nedeljni pregled" no longer appears on Today. The review stays in "Još" → Nedeljni pregled.
   - The other conditional notices stay: the first-run transfer notice, the backup reminder and the evening journal notice.
   - `Core.weeklyReviewDue` and the review log (`settings.weeklyReviews`) are unchanged.
3. **Task rows: the due date under the title, the checkbox at the far right (T3 amended).**
   - **Where:** every row built by `renderTodayTaskRow` (Danas, Inbox, Zadaci, a project, an area, a tag, Završeni zadaci, a saved view, the Calendar day list).
   - **Order:** the text comes first. The round checkbox is the last item, at the far right, keeping its 44 px touch target.
   - **The meta line under the title:** the priority flag (high red, medium amber), the due label in the G6 colors ("Rok danas", "Rok 6. okt"), then the planned time and the place, separated by " · ". Example: "⚑ Rok 6. okt · Client Website".
   - **Redovne obaveze (R11d):** it passes its own meta and right-side text. That text stays, between the title and the checkbox.
   - **The cause of the old look:** `.task-row--today` set four grid columns that overrode the phone rule. The checkbox ended up right after the title, and the due date at the far right.
   - **Goal and milestone rows on Today (T2a)** follow the same pattern. The due label joins the meta line ("Cilj · 45% · Rok 6. okt"), and the target icon moves to the right, in the checkbox column.
4. **A nicer "+" menu (G2).**
   - **The backdrop:** opening the floating "+" dims the screen behind it with a dark scrim (no blur, as the V1.8 Quiet Graphite rules require) (`#mobile-quick-add-scrim`). A tap on the scrim only closes the menu, so nothing underneath is opened.
   - **The layout:** each entry is a label pill on the left and its icon tile on the right. The icons form one column above the "+" and have the same width.
   - **Motion:** the entries rise one after another, the nearest first. With reduced motion they simply appear.
   - **Unchanged:** the entries, their order and their actions.
5. **Inbox rows (tasks with nothing assigned, I5).**
   - **The layout:** they get the row layout of item 3. "Rok 9. okt" moves under the title instead of overlapping the checkbox.
   - **The chips:** "Danas", "Sutra", "Kad stignem" and "Projekat…" become visible pills: a thin border, a graphite fill and 13 px text. Each keeps a 44 px touch height, and the pill is drawn inside it.
   - **Also:** the "+ Danas" chip of the Zadaci suggestions gets the same look.
6. **The task window (R3, D1).**
   - **Opening:** opening a task no longer puts the cursor in the title, so the phone keyboard does not open. Focus goes to the window's X, as in the goal and habit windows, and a tap on the title edits it.
   - **The title field:** it always shows a border (gray, lighter on hover) and turns blue while it is edited.

## Compatibility

- **Data, backups and sync:** unchanged.
- **Behavior:** completing, dragging, the task menu and the swipe gestures are unchanged. Only the order of the row's parts and the CSS change.
- **The weekly review screen, its log and "Završi nedeljni pregled":** unchanged.
- **Older tests** that pinned the right-side flag and due label, the Today notice or the left target icon are rewritten with an R14 note.

## Tests (written first)

`tests/redesign-r14.test.js`:

- the header row and the search button styles;
- Today without the weekly review notice, with its strings gone from the catalog;
- the task row order (text, side, actions, checkbox) and the meta line with flag, due, time and place;
- Redovne obaveze keeping its side text;
- the goal and milestone rows;
- the scrim in `index.html`, opened and closed with the menu, and the menu styles;
- the Inbox chips as pills with a 44 px touch height;
- the task window focusing X instead of the title, and the title field's border;
- the version `2.0.0-alpha.35`.

`npm run smoke` adds:

- Today has no weekly review notice;
- a task row ends with its checkbox and shows its due label under the title;
- "+" opens the menu with the scrim;
- a tap on the scrim closes both;
- opening a task leaves the title field unfocused.
