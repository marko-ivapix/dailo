# Redesign R11e — the "Nova redovna obaveza" window (design)

**Date:** 2026-10-10 · **Status:** implements S15 (the new recurring-task window), S4 ("+ Dodaj obavezu") and K4 of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.30`. This closes R11.

## What changes

1. **The window.** "+ Dodaj obavezu" in a group, and the floating "+" on Redovne obaveze, open the tall window "Nova redovna obaveza". It replaces the chore form with the room select, first date, frequency select, interval and reminder fields. The "+" is labelled "Nova redovna obaveza" (K12, like the other direct "+").

   The window has, in order:
   - **The name** as a big field: "Usisaj, plati račun, promeni ulje…".
   - **"Grupa":** one chip per active group and "Bez grupe". The group whose "+ Dodaj obavezu" was used is chosen, or else the first group.
   - **"Počinje":** chips Danas / Sutra / Sledeće nedelje and a date field.
   - **"Ponavljanje":** the repeat editor of R11b inside the window (K4: the window is tall because it holds the editor):
     - chips, frequency, Razmak, days or day of month, the yearly note;
     - the sentence and "Sledeći put:";
     - Kraj.

     It starts weekly on the start day's weekday. A new start moves the days the person has not chosen yet (the weekday, the day of the month, the nth weekday) along with it (`repeatEditorSetStart`); chosen days stay.
   - **The big "Zakaži obavezu".**
2. **Saving:**
   - **Refused:** without a name ("Unesi obavezu."), or with a bad end ("Izaberi ispravan datum kraja ili broj ponavljanja.").
   - **The first time is the first matching day from the start** (`Core.firstRecurrenceDate`). It becomes the task's plan day and due day.
   - **The task** belongs to the chosen group, or to no project for "Bez grupe". Its repeat is the R11a rule with its own series.
   - **Afterwards:** the window closes, Redovne obaveze shows the task, and the message says "Zakazano · prvi put sutra" (or the date).
3. **One editor, two places.** The editor's body (`repeatEditorHtml`) and its state changes (`repeatEditorUpdate`) are shared:
   - The task window's sheet wraps them with its title, the controls and "Primeni".
   - The new window renders them inline.

   Its end-field check (`repeatEditorError`) is shared too.

## Removed

- The chore form with selects and its validation sentence;
- the room-only labels;
- unused catalog entries.

## Compatibility

- **Data:** unchanged. The task is an ordinary repeating task in a group project, or without a project.
- **The task window's repeat sheet:** behaves as in R11b and R11c.

## Tests (written first)

`tests/redesign-r11e.test.js`:

- the window's parts and defaults;
- group and start choices;
- the inline editor's actions refreshing the window;
- the name and end checks;
- the created task (group, first matching day, rule, series) and the message;
- "Bez grupe";
- the direct "+";
- the shared editor functions;
- the version `2.0.0-alpha.30`.

`npm run smoke` adds: the R11d group's "+ Dodaj obavezu" → a name → Sutra → Mesečno → Zakaži obavezu → the task is in the group on its first matching day.
