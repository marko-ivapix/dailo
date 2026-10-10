# Redesign R8c — the habit details window (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.15`.

## What changes

1. **A window (S13).** "Detalji navike" opens as a tall sheet over the current screen, not as a page. It opens from:
   - the habit menu on Today and in Dan;
   - the paused and archived rows;
   - any habit link (goals, areas, saved views, Inbox, the weekly review).

   An old `#habit/<id>` address opens the Habits screen with the window on top.
2. **Top.**
   - "Navika" with ⋯ and X. The ⋯ menu holds Sačuvaj kao šablon, the snooze choices, Arhiviraj / Vrati and Obriši.
   - The name and one line: frequency · routine · status.
3. **Today (active habits).** The Today row with its round check, then "Danas: …". A checkbox habit that is not done has "Preskoči danas" or "Poništi preskakanje".
4. **Four numbers:** Trenutni niz, Najduži niz, Ukupno unosa and Ostvareno ove nedelje (the week bar of R8a as a percent).
5. **The month calendar.**
   - One calendar month with arrows; the next arrow stops at this month. The days are colored by state: done, missed, skipped, open, not scheduled, future.
   - A tap on today or a past day records it like a tap in Dan: done ↔ missed, and skipped → done. A numeric habit opens the value sheet; closing the sheet returns to the window.
   - Future and unscheduled days are inactive. Past days stay editable for a paused or archived habit, as before.
6. **"Uvid":**
   - this week (done of planned);
   - the period target (current / minimum / ideal, with "Minimalni cilj ostvaren" and similar);
   - the recovery line (recovered or resume after missed days, within or beyond the grace days).
7. **"Podešavanja":** rows with "›" that open the R8b sheets. A change saves at once.
   - Naziv and Oblast;
   - Rutina;
   - Praćenje: it cannot change while the habit has history, but a numeric target and unit can;
   - Brze vrednosti (numeric only);
   - Učestalost;
   - Podsetnici;
   - Minimalna i idealna (numeric or X puta nedeljno);
   - Dani tolerancije;
   - Nastavak;
   - Kraj;
   - Povezani ciljevi.

   A new weekly target applies from this week on (M11). Changing the goal links re-evaluates goal progress.
8. **Bottom:**
   - "Pauziraj naviku" for an active habit;
   - "Nastavi naviku" for a paused one;
   - "Vrati naviku" for an archived one.

   Each closes the window and offers "Poništi".

## Removed

- The habit page with its inline property editors, the analytics strip and chart, the heatmap, the rolling week/month insight cards and the history editor.
- The settings panels (frequency, reminders, continuation, end, goals, edit history) with their save buttons.
- Their actions and the app's inline habit property editor.

## Compatibility

- **Data:** unchanged. Every field keeps its validation:
  - the target is a number above zero;
  - minimum and ideal are whole numbers unless the habit is numeric daily;
  - the ideal is at least the minimum;
  - grace days are whole and zero or more.
- **Logs:** the history is edited through the same `setHabitLog` path as before.
- **Old tests** that rendered the habit page now check the window, with an R8c note.

## Tests (written first)

`tests/redesign-r8c.test.js`:

- opening from a route, a link and the menu;
- the window's top, today, numbers, calendar, insight, settings rows and footer;
- the history toggle and the value sheet's return;
- the sheets saving to the habit (name, area, routine, tracking with and without history, grace days, continuation, frequency with a weekly target change);
- pause, resume and restore;
- the version `2.0.0-alpha.15`.

`npm run smoke` adds: Today → a habit's menu → Detalji navike → the window → a day in the calendar changes the history → X closes it; an old `#habit/<id>` address opens the window over Navike.
