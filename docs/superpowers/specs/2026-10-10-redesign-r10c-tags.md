# Redesign R10c — Oznake (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.21`.

R10 now ships in six parts, so that each stays reviewable:

- R10a: Oblasti.
- R10b: Beleške and Resursi.
- **R10c: Oznake (S6).**
- R10d: Šabloni and Sačuvani prikazi (S7, S8).
- R10e: Završeni zadaci, Arhivirani projekti, Pretraga and Fokus (S9–S12).
- R10f: Settings and the retired sidebar (M5, M6).

## What changes

1. **Oznake (S6).**
   - "Oznake" with "N oznaka", and one card with the tags by name.
   - A row has the color dot, the name and what uses the tag: "1 zadatak · 1 u biblioteci", or "Nije u upotrebi".
   - A tap opens the tag. "+ Nova oznaka" closes the card.
   - This replaces the two-column list with the selected tag.
2. **A tag screen** (`#tag/<id>`):
   - the name, with "N aktivnih zadataka" underneath;
   - the ⋯ menu: Izmeni oznaku, and Obriši oznaku with confirmation and Undo;
   - the active tasks as Today rows;
   - new: "U biblioteci · N" with the notes and resources that carry the tag, newest first.

   Completed tasks are not shown; they stay in Završeni zadaci. Without active tasks, the screen says how to assign the tag. A deleted tag's address shows Oznake.
3. **The tag window ("Nova oznaka" / "Izmeni oznaku")** is a sheet like the area window:
   - the name as a big field;
   - Boja;
   - one big "Napravi oznaku" or "Sačuvaj izmene" button.

   A missing or duplicate name is rejected, as before. A new tag stays on the current screen with "Oznaka „…“ je napravljena".
4. **The floating "+" on Oznake** opens "Nova oznaka" directly and says so (K12).

## Removed

- The selected-tag column and `ui.selectedTagId`, together with its handling in delete and Undo.
- The header button "Nova oznaka".
- The "Otkaži / Napravi" pair of the tag window.

## Compatibility

- **Data:** unchanged.
- **"Aktivni zadaci"** are the open tasks with the tag (`Core.tasksForTag`), without the tasks of archived projects (S10). The list and the tag screen count the same tasks.

## Tests (written first)

`tests/redesign-r10c.test.js`:

- the list, its rows and usage words, "+ Nova oznaka" and the empty state;
- the tag screen with its tasks, library items, menu and empty text;
- the window with a missing name, a duplicate, a create with the toast, and an edit;
- the route and the floating "+";
- the version `2.0.0-alpha.21`.

`npm run smoke` adds: Još → Oznake → "+" says "Nova oznaka" → a name → Napravi oznaku → the tag → its screen.
