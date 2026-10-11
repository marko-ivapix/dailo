# Redesign R22b — one look for the controls (design)

**Date:** 2026-10-11 · **Status:** fix 10 of the second design audit, which the user approved with "moze sve" · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.46`.

## What changes

1. **Segments.**
   - **Inbox filter:** it was a third style, a `tablist` without a tab panel. Now it is a row of pills (`.inbox-filter-chips`, `aria-pressed`) with the counts inside.
   - **Zadaci's "Kad stignem / Projekti":** full width, like the window segments.
   - **The Calendar's "Lista / Raspored":** 14 px text.
2. **Folds.**
   - **One helper:** `foldButton(action, label, count, open, attrs)` draws every fold: the label and count on the left, the caret on the right, `aria-expanded`.
   - **Where:** Danas → Završeno, Predlozi, a project's done tasks, the goals, habits and areas folds, and Redovne obaveze → done and archived groups.
   - **"Vrati":** it is a chip in every fold. Archived groups had a gray button.
3. **Empty states and labels.**
   - **Empty lines:** `.area-empty-hint` and `.area-empty-copy` read like `.today-empty`.
   - **The Inbox empty state:** it lost its second icon.
   - **Section labels:** the titles of Redovne obaveze groups, the review cards, the Inbox groups and the Settings groups use the section label (12 px, uppercase, gray).
   - **Project lists:** in Zadaci and on an area they use the usual card (`.today-card.project-list`) instead of the darker Još card.
4. **Big buttons.**
   - **Text size:** `.habit-window-save` is 16 px everywhere.
   - **The goal window:** its bottom button fills the footer instead of sitting on the right.
5. **Settings on a phone.**
   - **Selects:** at ≤ 520 px a select sits under its label instead of being squeezed beside it.
   - **Switches:** on / off settings, and Važno / Hitno in the task window, are switches.
   - **Nalog:** "Pošalji kod" is the main (blue) button.
6. **The confirm dialog.**
   - **The layout:** it is a sheet like the other choice windows (`quick confirm-modal`): the title, the message and the word to type (`.sheet-label`), then the red button and "Otkaži" as full-width buttons. Before, it opened at the top on phones and used inline styles.
   - **The typed words are Serbian:** "RESETUJ" and "VRATI" instead of "RESET" and "RESTORE", like "OBRIŠI" for the account (`CONFIRM_WORDS`). Case and diacritics do not matter (`plainWord`).
7. **Search.**
   - **Dnevnik:** its search field looks like the other search fields (`.sheet-search`).
   - **Pretraga:** project results stack the name and meta like task results. Scope, ranking and grouping are unchanged.
8. **The task window.**
   - **The project:** it shows once, as the blue link under the title. The row under Organizacija is gone.
   - **"Više opcija":** its rows read like the window's other rows.
   - **Prilozi:** the heading reads like the group titles. "Prevuci fajlove ovde" is hidden on touch screens, where the button adds files.

## Compatibility

- **Data:** unchanged.
- **Behavior:** unchanged, except the typed confirm words. Reset and restore still need a word, a safety ZIP and the recovery copy.
- **Older tests:** they get the shared `foldButton` (`tests/support/fold.js`) or are rewritten with an R22b note.
- **Browser regressions:** the V1.x Playwright scripts that type "RESET" or "RESTORE" are historical.

## Tests (written first)

`tests/redesign-r22b.test.js`:

- the Inbox pills;
- the segments;
- `foldButton` and its use;
- empty states and labels;
- project list cards;
- big buttons;
- Settings rows and switches;
- the confirm sheet and its words;
- the journal search and the project result;
- the task window;
- the version `2.0.0-alpha.46`.
