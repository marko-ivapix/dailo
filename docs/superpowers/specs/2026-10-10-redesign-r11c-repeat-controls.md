# Redesign R11c — repeat controls and the narrower scope question (design)

**Date:** 2026-10-10 · **Status:** implements S14 of `2026-10-08-redesign-decisions.md` (final 2026-10-09) on the editor from R11b · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.28`.

## What changes

1. **Completing a repeating task** (anywhere it is completed through the round check, the task window or Fokus):
   - It creates the next one as before.
   - The message says when the next one comes: "Zadatak je završen · sledeći put sre 14. okt", with "Poništi".
   - Without a next one (paused, ended, or past the end) the message stays "Zadatak je završen".
2. **The controls at the bottom of the "Ponavljanje" sheet** appear only for a task whose repeat is active or paused, under "Ovo ponavljanje". Each has a one-line explanation:
   - **"Preskoči sledeći put":** completing then skips one occurrence. While a skip is scheduled the row reads "Preskakanje je zakazano · otkaži", and tapping it cancels the skip.
   - **"Pauziraj ponavljanje" / "Nastavi ponavljanje":** while paused, completing creates no next one.
   - **"Završi ponavljanje",** in red: this task stays, no more are created.

   Each says what it did ("Sledeće ponavljanje će biti preskočeno", "Preskakanje je otkazano", "Ponavljanje je pauzirano", "Ponavljanje se nastavlja", "Ponavljanje je završeno") and offers "Poništi". Poništi restores the series' tasks as they were, and removes a next task that "Nastavi" created for a completed one.
3. **The rule's sentence** adds "· pauzirano" while paused and "· završeno" once ended. An ended repeat starts again when "Primeni" is used in the editor, even with no other change.
4. **"Samo ovo / Ovo i buduća" is asked only for a change of a date or the repeat:**
   - Planirano or Rok, with their times;
   - the reminder, which moves with the occurrence;
   - Ponavljanje.

   This covers the task window, dragging in the calendar, "Dodaj u Danas", "Sutra" and "Bilo kada". The title, notes, subtasks, project, tags, priority and duration save at once without asking. On an occurrence that was changed with "Samo ovo" before, they are also written to its baseline, so the next occurrence carries them.
5. **The question is a small window "Primeni izmenu"** with the task's name and two rows:
   - "Samo ovo": "Sledeća ponavljanja ostaju kako su bila.";
   - "Ovo i buduća": "Izmena važi od ovog ponavljanja nadalje.".

   X cancels as before. After the choice the message reads "Sačuvano · samo ovo" or "Sačuvano · ovo i buduća", with "Poništi" restoring every task the choice changed.
6. **"Samo ovo" keeps the rule on its old day; "Ovo i buduća" moves the rule's day along** (`Core.recurrenceDayShift(rule, from, to)`). Moving the plan day (or the due day when there is no plan day) from the rule's old day, taken from the baseline when there is one, changes:
   - the chosen weekday in a weekly rule;
   - the chosen day of the month;
   - the weekday of an nth-weekday rule ("Poslednji" stays last).

   "Poslednji dan", daily, yearly and legacy rules follow the date as before.

## Compatibility

- **Data:** unchanged. The statuses `active`, `paused` and `ended` and `skipNext` are the existing fields.
- **The skip target is unchanged:** the series' earliest pending occurrence without a successor (V1.3).
- **Historical script:** the manual Playwright script `ui-v1-3-tools.py` used the old dialog wording and is a historical browser check, not run here.

## Tests (written first)

`tests/redesign-r11c.test.js`:

- the completion message with the next date and its Undo;
- the controls' wording, the skip toggle, the messages and Undo, including a successor created by "Nastavi";
- the sentence suffixes;
- reviving an ended repeat;
- the narrower question: silent fields, written to the baseline, and asking for dates, the reminder and the repeat;
- the "Primeni izmenu" window;
- scope Undo;
- `Core.recurrenceDayShift`, and "Ovo i buduća" moving a weekly rule's day;
- the version `2.0.0-alpha.28`.

`npm run smoke` adds: the repeating task from R11b → its title changes without a question → its plan day moves → "Ovo i buduća" → the rule's weekday moved → Poništi restores it.
