# Redesign R10a — Oblasti and one area (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.19`.

R10 ships in parts:

- **R10a:** Oblasti and one area (S1, S2).
- **R10b:** Beleške and Resursi (S3).
- **R10c:** Oznake, Šabloni and Sačuvani prikazi (S6–S8).
- **R10d:** Završeni zadaci, Arhivirani projekti, Pretraga and Fokus (S9–S12).
- **R10e:** Settings (M5, M6) and the retired sidebar.

## What changes

1. **Oblasti (S1).**
   - "Oblasti" with "N aktivnih oblasti".
   - One card with the active areas. A row has:
     - the area icon in its color;
     - the name;
     - "2 projekta · 10 otvorenih · 1 cilj". Projects and goals show only when there are any, and a pinned area adds "· zakačena".
   - A tap opens the area. "+ Nova oblast" closes the card.
   - The archived areas fold at the bottom: "Arhivirane · N", with "Vrati" on each row.
   - This replaces the Sve / Aktivno / Arhivirano tabs and the rows' ⋯.
   - With no areas at all, the empty state offers "Nova oblast".
2. **The area window ("Nova oblast" / "Izmeni oblast").**
   - It is a sheet with the name as a big field, Boja and Ikonica, and one big "Napravi oblast" or "Sačuvaj izmene" button.
   - A missing or duplicate name is rejected, as before.
   - A new area stays on the current screen with "Oblast „…“ je napravljena".
3. **One area (S2).**
   - The name, with the summary line underneath: "2 projekta · 10 otvorenih · 1 cilj · 3 u biblioteci". An archived area starts the line with "Arhivirana oblast".
   - The ⋯ menu holds Izmeni oblast, Zakači u „Još“ / Otkači iz „Još“, Arhiviraj oblast / Vrati oblast and Obriši oblast.
   - Sections, each with its count and a "+":
     - **Projekti:** the active projects as Zadaci → Projekti rows.
     - **Zadaci:** the open, sorted tasks as Today rows, five at first, then "Prikaži još N".
     - **Ciljevi:** the active goals as Ciljevi rows.
     - **Navike:** the active habits, with their frequency.
     - **Beleške i resursi:** newest first.
   - An empty section keeps only its header and "+". A completely empty area shows one line pointing to the "+" buttons.
   - The "+" of Beleške i resursi makes a note in this area.

## Removed

- The tabs with their keyboard handling and `ui.areaTab`.
- The six number cards.
- The "nothing here" sentences.
- The separate Notes and Resources sections of an area.
- The "Cancel / Create" pair of the area window.

## Compatibility

- **Data:** unchanged.
- **Counts:** "otvorenih" counts the open, sorted tasks of the area (Inbox items and tasks of archived projects are left out), which is the same list the area shows.
- **Archived projects** leave the area, as they leave every list (S10).

## Tests (written first)

`tests/redesign-r10a.test.js`:

- the list, its rows, the pinned mark, "+ Nova oblast", the archived fold and the empty state;
- the area window: a missing name, a duplicate, a create with the toast, and an edit;
- the area screen: the summary, the sections with their "+", the rows, "Prikaži još", the empty sections, the empty area and the menu;
- the routes for goal and habit rows;
- the version `2.0.0-alpha.19`.

`npm run smoke` adds: Još → Oblasti → "+ Nova oblast" → a name → Napravi oblast → the area → "+" of Zadaci opens Quick Add for that area.
