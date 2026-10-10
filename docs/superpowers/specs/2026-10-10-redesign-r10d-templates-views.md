# Redesign R10d — Šabloni and Sačuvani prikazi (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.22`.

## What changes

1. **Šabloni (S7).**
   - Under the title: "Stavke za ponovnu upotrebu, sa datumima u odnosu na dan kad ih praviš."
   - The templates are grouped by type instead of the tabs: "Zadaci · N", "Projekti · N", "Navike · N", "Ciljevi · N". Empty groups are left out.
   - A row has the name and what it makes, with its count: "Pošalji izveštaj · 3 podzadatka", "5 zadataka", "3 etape".
   - **A tap opens a sheet:**
     - the big "Upotrebi šablon" button, which opens the usual new-item window already filled, as before;
     - Izmeni šablon;
     - Dupliraj;
     - Obriši, with confirmation and Undo.
   - **"+ Novi šablon"** stays on the screen. It asks for the type, then opens the template editor. The floating "+" does the same (K12).
   - A note says that "Sačuvaj kao šablon" in the item menus also makes one.
2. **Sačuvani prikazi (S8).**
   - **The list.** One card. A row has:
     - the name;
     - the type, "zakačen u „Još“" when pinned, and the filter summary;
     - on the right, how many items the view has now.

     The card ends with "+ Novi sačuvani prikaz", and the floating "+" opens the same window.
   - **The result screen:**
     - the name, with the summary and the count underneath;
     - the ⋯ menu: Izmeni prikaz, Dupliraj prikaz, Zakači u „Još“ / Otkači iz „Još“, and Obriši prikaz with confirmation and Undo;
     - the items as Today rows (tasks), Ciljevi rows (goals) or compact habit rows.
   - **The edit window:**
     - the name as a big field;
     - "Vrsta stavki" as a segment: Zadaci / Ciljevi / Navike. Changing it drops the filters that do not apply.
     - one row per filter, each with a sheet: a choice with "Sve", or for the exact-day filters a date with "Obriši" and "Primeni";
     - "Zakači u „Još“";
     - "Rezultata sada: N";
     - the big "Sačuvaj prikaz" button.
3. **Copy names.** A duplicated template or view is named "… (kopija)" (it was the English "… copy"), and it says so: "Šablon je dupliran" / "Prikaz je dupliran".

## Removed

- **Šabloni:** the type tabs and `ui.templateType`; the row icon buttons.
- **Sačuvani prikazi:**
  - the list's icon buttons;
  - the form with selects and date fields;
  - the "Otkaži / Sačuvaj" pair.

## Compatibility

- **Data:** unchanged. Saved views keep their types, filter keys and values. A filter whose item no longer exists shows "Stavka ne postoji", as before.
- **Template editing** keeps the existing editor and validation.

## Tests (written first)

`tests/redesign-r10d.test.js`:

- the grouped templates, the row sheet with its four actions, and the type sheet;
- the view list with counts, the result screen with its rows and menu, and the edit window: segment, filter sheets, pin, results now, name required and save;
- the copy names;
- the floating "+";
- the version `2.0.0-alpha.22`.

`npm run smoke` adds: Još → Sačuvani prikazi → "+" → a name, Navike → Sačuvaj prikaz → the row → the result screen.
