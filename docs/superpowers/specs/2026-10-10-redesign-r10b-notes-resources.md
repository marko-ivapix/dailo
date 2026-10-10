# Redesign R10b — Beleške and Resursi (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.20`.

## What changes

1. **Two screens with one list each (S3).** Beleške and Resursi stay two screens. Each has:
   - **The summary:** "N beleški", or "M od N beleški" while a filter is on.
   - **Filter chips:**
     - "☆ Omiljeno" switches on and off.
     - Oblast and Oznaka (resources also Vrsta and Status) open a choice sheet. The chosen value is shown on the chip.
     - "Obriši filtere" appears while a filter is on.
   - **One card, newest first.** A row has:
     - the icon;
     - the title;
     - for a resource, "Članak · Nepročitano · Oblast";
     - for a note, "Oblast · 2 linka · 1 fajl";
     - the tags as color dots;
     - the star, which marks it favorite.
   - **Empty states:**
     - "Nijedna stavka ne odgovara ovim filterima.";
     - "Još nema beleški" / "Još nema resursa" with "„+“ dole desno dodaje novu.".
   - **The floating "+"** opens "Nova beleška" or "Novi resurs" directly and says so (K12), as on Ciljevi.
   - The header button "Nova beleška" leaves (G2).
2. **A window like the task window.** A note or a resource opens as a tall sheet from a row, from a `note/<id>` or `resource/<id>` link (Inbox, an area, saved items), or from an old address. An old address shows the list with the window on top.
   - **The header:** "Beleška" / "Resurs", the star, ⋯ (Obriši, with confirmation and Undo) and X.
   - **The name** as a big field, and the area link under it.
   - **A resource** also has Vrsta, Status čitanja, Autor and Poslednji pregled, each a row with its sheet.
   - **Tekst / Opis.**
   - **Isečak teksta,** shown as a quote when there is one.
   - **Linkovi · N:** each link opens in the browser and has ✕; a field with "Dodaj" adds one.
   - **Organizacija:**
     - Oznake (multiple choice with "Primeni");
     - for a resource, Povezani zadaci, projekti, ciljevi and navike (multiple choice with "Primeni");
     - Isečak teksta (a text sheet).
   - **Prilozi,** as in the task window.
3. **Saving.**
   - **An existing item saves at once.** Typing in the name or the text saves after a short pause. Each sheet, link and star saves when applied.
   - **A change that would break the item is refused** with the reason, and the item stays as it was. Such a change is an empty name, a bad link, or the last link of a resource that has no file.
4. **A new item** ("Nova beleška" / "Novi resurs", also from an area's "+" and the "+" menu) uses the same window with "Napravi belešku" / "Napravi resurs" at the bottom.
   - After saving, the window stays open on the new item and shows "Beleška je napravljena" / "Resurs je napravljen".
   - Closing it unsaved drops the draft.
5. **A note needs only a name** (decided 2026-10-09), so a note with text only is allowed. A resource still needs at least one link, image or file. Notes get no links to tasks, projects, goals or habits; resources keep theirs.

## Removed

- The item page with its cards and sections.
- The long form with selects, checkboxes and the "Name plus a link or file" hint.
- The selects of the old filter bar.

## Compatibility

- **Data:** unchanged.
- **The validation of notes is relaxed.** `Core.validateKnowledgeRecord` asks for a source only for resources. Backup validation never asked for one, so older backups and devices read text-only notes as before.
- **Kept behavior:**
  - the favorite rollback on a failed write;
  - the review-date rule;
  - the relation and area checks;
  - the attachment owner pipeline;
  - the rollback of a new resource whose only file fails to upload.
- **Old tests** of the page and the form now check the window, with an R10b note.

## Tests (written first)

`tests/redesign-r10b.test.js`:

- the list, rows, chips, filter sheets, "Obriši filtere" and the empty states;
- the window for a note and for a resource;
- the sheets saving at once;
- the refused changes;
- a text-only note;
- creating with the window staying open;
- the floating "+" and the routes;
- the version `2.0.0-alpha.20`.

`npm run smoke` adds: Još → Beleške → "+" says "Nova beleška" → a name and text → Napravi belešku → the window stays with ⋯ → X → the note is in the list.
