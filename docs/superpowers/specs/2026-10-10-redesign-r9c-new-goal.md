# Redesign R9c — the new goal window and the floating "+" (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.18`.

## What changes

1. **A window like the new habit window (GO7, N1).**
   - "Novi cilj" opens as a tall bottom sheet with X.
   - The name is a big field ("Šta želiš da postigneš?").
   - A big "Napravi cilj" button sits at the bottom. Without a name it asks for one ("Cilj mora imati naslov.").
   - A new goal stays on the current screen and shows "Cilj je napravljen".
   - "Iz šablona" stays at the top, as before.
2. **First screen:**
   - **Oblast:** a row with "›" and the area sheet; optional.
   - **Horizont:** Kratkoročno / Srednjoročno / Dugoročno; the default is Kratkoročno.
   - **Napredak:** Ručno / Zadaci / Navike.
     - Ručno offers Procenat / Broj. Broj shows "Ciljna vrednost [ ] [jedinica]" right below.
     - Zadaci and Navike explain where the progress comes from and point to "Više".
   - **Ciljni datum:** a row with the R9b date sheet (Za mesec dana, Za 3 meseca, Kraj godine, a date field, "Bez datuma" / "Primeni").
   - The segments use the neutral selected look; blue is only the main button.
3. **"Više" (Etape, podsetnik, veze):**
   - **Etape:** the draft milestones as rows. The title opens the milestone editor, ✕ removes one with confirmation and Undo, and "+ Dodaj etapu" sits at the end.
   - **Podsetnik:** the reminders window.
   - **Povezano:** the links window, summarized as "N projekata · M zadataka · K navika".
4. **The floating "+" on Ciljevi** opens "Novi cilj" directly, without the menu. Its label says "Novi cilj" (K12), and the shortcut for a new item (Q) does the same on this screen. Elsewhere the "+" keeps its menu.
5. **Editing** happens in the goal window (R9b). "Izmeni cilj" in the goal menus of other screens opens the goal window, and the form window no longer edits.

## Removed

- The long form with selects for area, horizon, progress source and type, the current value, and the target date field.
- The "Otkaži / Napravi cilj" pair.
- Opening the new goal after creating it.
- The form's edit mode.

## Compatibility

- **Data:** unchanged. The validation stays:
  - a name is required;
  - a numeric manual goal needs a target above zero.
- **The draft** (`goalDraft`) keeps every field: current value, status, milestones, reminders and links from a template.
- **An unset target date** is stored as `null`.
- **Inbox:** a goal made with the "+" on Ciljevi is not an Inbox item. "Cilj" in the "+" menu of other screens still files it in Inbox, as before.

## Tests (written first)

`tests/redesign-r9c.test.js`:

- the window's field, rows, segments, numeric target and "Više" rows;
- the segments and the area and date sheets on the draft;
- the milestones under "Više";
- creating with and without a name, the numeric target rule, the toast and staying on the screen;
- the floating "+", its label and Q on Ciljevi;
- "Izmeni cilj" opening the goal window;
- the version `2.0.0-alpha.18`.

`npm run smoke` adds: Ciljevi → "+" → a name, Broj with a target and unit, Ciljni datum → Kraj godine → Primeni → Napravi cilj → the goal exists.
