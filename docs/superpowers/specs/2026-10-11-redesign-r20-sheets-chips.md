# Redesign R20 — sheets, chips, sticky footers and dates under the title (design)

**Date:** 2026-10-11 · **Status:** the user asked for a second pass over the whole design ("da li mozes da prodjes kroz ceo dizajn i da mi kazes sta bi popravio i sta bi dodao"). The answer listed twelve fixes and eleven additions, and the user replied "moze sve". R20 ships fixes 1–6; R21 and R22 ship the other fixes; R23–R28 ship the additions · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.43`.

## What changes

1. **Options in bottom sheets are 48 px rows with 15 px text.**
   - **The cause:** an old density rule made every `.popover-option` 32 px tall with 12 px text, and only `.sheet-option` restored the height.
   - **The fix:** `.popover--sheet .popover-option` sets the height and the text size.
2. **A ⋯ menu is a sheet like the others.**
   - **The layout:** the item's name is the title (a task, tag, attachment, area, goal, habit, saved view, note, resource or project), and the options sit in one card.
   - **The helper:** `menuSheet(title, body)` in `app.js` builds it and is handed to the domain modules.
   - **Delete rows:** they are red through `.popover-option.is-danger` instead of an inline color. "Resetuj" and "Obriši nalog" in Settings use `.btn.is-danger` the same way.
3. **Every chip is a pill.**
   - **What spreads:** R19's pill (a `::before` inside the 44 px touch height, the selected one filled with the accent) now applies to every `.quick-chip`. That covers the date, reminder, repeat and duration sheets, "Iz šablona", the habit value chips, the "Nova redovna obaveza" group chips, "+ Zadatak za sutra", and the Nastavi / Vrati chips in the folds.
   - **What keeps its own look:** the task-row pills (R14) and the filter rows (R19).
4. **Inbox items that are not tasks line up with the task rows.**
   - **The icon goes:** the type is already in the meta line.
   - **The chips:** they are the same pills as on the task rows.
5. **The Save or Apply button stays in reach.**
   - **The fix:** `.sheet-footer` and `.quick-sheet-footer` are sticky at the bottom, over a fade, like the task window's button.
   - **Where it matters:** long sheets and windows (Novi cilj or Nova navika with "Više" open, a new note, Nova redovna obaveza, the goal window, the date and repeat sheets).
6. **Dates and counts under the title:**
   - Redovne obaveze rows put the date first in the meta line (`metaLead`), and the right side is gone (`sideHtml` and `.task-side` are removed);
   - step 3 of Nedeljni pregled puts the day's count under the date.
7. **"Prijavi se" in the phone app's transfer notice opens Nalog,** where sign-in has lived since R15. Before, it led to Podešavanja.
8. **"Iz šablona" in Novi projekat, Nova navika and Novi cilj is a chip under the window title.** It shows only when templates of that type exist. Before, it was a bare button above the title, shown even without templates.

## Compatibility

- **Data:** unchanged.
- **Behavior:** unchanged. Only markup order, classes and CSS change.
- **Older tests:** the ones that pinned the old markup are rewritten with an R20 note.

## Tests (written first)

`tests/redesign-r20.test.js`:

- the sheet option size;
- `menuSheet` and its use in every menu, with no inline danger color left;
- the chip pill;
- the Inbox item row;
- the sticky footers;
- the chore meta line and the review day row;
- the transfer notice route;
- the "Iz šablona" chip;
- the version `2.0.0-alpha.43`.

`npm run smoke` adds:

- a task's ⋯ menu is a titled sheet with one card and a red Obriši;
- Nova navika has no "Iz šablona" without habit templates.
