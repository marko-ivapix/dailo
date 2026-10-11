# Redesign R21 — the old windows as sheets (design)

**Date:** 2026-10-11 · **Status:** fix 3 of the second design audit, which the user approved with "moze sve" · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.44`.

## Problem

Some windows that open from the new screens still have the pre-redesign form:

- labels above inputs in the old style (`.field-label`);
- a Cancel / Save footer (`.modal-footer`);
- on wider screens, a centered dialog;
- in the template editor, multi-selects and a "0 = Sun, 1 = Mon … 6 = Sat" field.

## What changes

1. **Form windows become sheets.** They open as bottom sheets at every width (`'quick'`), close with their X, and have one big button in the sticky footer (`.habit-window-save` in `.quick-sheet-footer`).

   | Window | Class | Details |
   | --- | --- | --- |
   | Izvor napretka | `goal-source-window` | |
   | Etapa | `milestone-window` | The title is a big field and the date a field row. "Obriši" stays and is red through `.is-danger`. |
   | Veze cilja | `goal-links-window` | Groups with titles and check rows in cards. |
   | Podsetnici cilja | `goal-reminders-window` | Four check rows in one card and the time as a field row. |
   | The habit's day value | `habit-value-window` | The total is a field row. Before, this window opened centered. |
   | Šablon | `template-window` | See 3 below. |
2. **Choice windows have full-width buttons, the main one first.** The windows are "Cilj je ostvaren", the habit's end-of-period question and "Dupliraj zadatak". They use `.choice-window` and `.sheet-actions`.
3. **The template editor:**
   - the name is a big field;
   - every field has its label above it (`.sheet-label`);
   - checkboxes are check rows;
   - the goal links, tags and contributing tasks are chips instead of multi-selects;
   - a habit's weekdays are seven chips from Monday ("Pon … Ned") instead of "0 = ned, 1 = pon … 6 = sub". The stored values stay 0 to 6.

   Chips toggle in place (`template-chip`). Changing the goal links redraws their settings, as the old select did.
4. **Short windows:**
   - "Iz šablona" lists the templates as rows in one card;
   - the goal history has no footer, so its X closes it;
   - the finished "Razvrstaj redom" shows one big "Zatvori".
5. **Dead code goes:** the unused "Nova navika / Novi cilj" name window of the old area screen (`openAreaLinkedModal`, never called) and the template editor's `handleInput`, which only served the old goal select.

## Compatibility

- **Data:** unchanged. The template fields, their paths and validation are unchanged, and so are the ids and actions of every window.
- **Older tests:** the ones that pinned the old markup are rewritten with an R21 note.
- **Browser regressions:** the V1.x Playwright scripts (`tests/ui-v1-*.py`) select the template multi-selects. Like their other selectors replaced by the redesign, they are historical.

## Tests (written first)

`tests/redesign-r21.test.js`:

- each form window is a sheet with one big button and no old footer or labels;
- the choice windows;
- the history and the finished sorting;
- the new label, check rows and the milestone title;
- the template editor's chips, the weekday order and how the chips are read back;
- the picker rows;
- the removed window;
- the version `2.0.0-alpha.44`.

`npm run smoke` adds: "Sačuvaj kao šablon" from a habit opens the editor sheet, and a weekday chip is saved.
