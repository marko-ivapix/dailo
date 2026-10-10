# Redesign R8a — the Habits screen (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.13`.

R8 ships in three parts:

- **R8a:** this screen (H1–H7).
- **R8b:** the new habit window and the frequency sheet (N1–N6).
- **R8c:** the habit details window (S13).

Until R8c, a habit still opens its current details page.

## What changes

1. **Top (H1, H4).**
   - The "Navike" title with "N od M danas": the habits done today out of those planned today.
   - Below it, this week's rings, in both views. Each ring shows the share of the planned habits done that day, with the "%" small and muted.
   - A full ring shows a small green check. A future day, or a day with nothing planned, shows a dash.
   - Then the "Dan / Nedelja" switch. "+ Nova navika" stays in the floating "+" menu, and the header has no button.
2. **What counts as planned on a day (H4, H7).**
   - An active habit scheduled that day counts, unless the day is skipped.
   - A habit with a weekly target ("X puta nedeljno") never misses a single day. A day counts for it only when it is checked in that day, or today while the week's target is still open.
   - The week follows the habit week rule (M11).
3. **Dan (H2, H6).**
   - The selected day's habits, grouped by routine (Jutro, Dan, Veče) with their counts. Done habits move to the bottom of their group.
   - Each row is the Today row (R2): the round check and the name. The value ("1,5 / 2 l") or the week ("2/4 nedeljno") sits on the right.
   - A line under the name shows the frequency with one of:
     - the streak today ("niz 5 dana");
     - "2 / 4 ove nedelje" for a weekly target;
     - "preskočeno";
     - "propušteno" on a past day.
   - Tapping a ring opens that day in Dan, with its name and date on top ("Utorak, 6. oktobar") and a quiet background on the ring. Tapping today's ring returns to today.
   - On a past day, a tap toggles done and missed, and a skipped day becomes done. A numeric habit opens the value sheet for that day. The name opens the same menu as on Today (value, skip, details) for that day.
   - Future days are inactive. Opening the screen always starts at today, in Dan.
4. **Nedelja (H3).**
   - A table with the habits as rows, grouped by routine, and the week's days as columns. Today's column is bold.
   - A circle records a day like a tap in Dan. Future days and days the habit is not scheduled are inactive.
   - A legend below: urađeno, propušteno, preskočeno, nije u planu.
5. **Napredak (H4, H7)**, under the list in both views:
   - **"Po navici · ova nedelja":** each active habit in routine order, with a count ("3/7") and a thin bar.
     - The bar measures the done days against the week's plan: the scheduled days without skipped ones, or the weekly target.
     - So it fills during the week. A full bar shows a small green check instead of the count.
   - **A line chart for one calendar month:**
     - the daily share done, with the y axis to 100% and "N% prosek";
     - arrows for the previous and next month; the next arrow stops at this month;
     - only today's value labelled.
     - A tap on any day shows that day's value. A hidden table gives every day's value to a screen reader.
6. **Paused and archived habits (H5)** fold at the bottom:
   - "Pauzirane · N" with "Nastavi";
   - "Arhivirane · N" with "Vrati".

   They replace the Aktivne / Sve / Arhivirane tabs.

## Removed

- The tabs.
- The monthly consistency tracker with its analysis column and legend.
- The routine descriptions.
- The old habit rows with their "Prijavi" / "Preskoči danas" buttons on this screen.

## Compatibility

- **Data:** unchanged.
- **Week:** the rings, the table and the bars use the habit week rule (`Core.habitWeekRule`), as all habit calculations do since M11.
- **Chart month:** `ui.habitTrackerMonth` now holds it.
- **New device-local UI fields:**
  - `ui.habitsView` (`day`, `week`) and `ui.habitsDay`, both reset to Dan and today whenever the screen is opened from another screen;
  - `ui.habitChartDay`;
  - `ui.habitsPausedOpen` and `ui.habitsArchivedOpen`.
- **`ui.habitTab`** is no longer read.
- **The Serbian routine "Daytime"** reads "Dan", as decided (N2).
- **New Core functions:**
  - `Core.habitDayState(habit, logs, date, today, weekRule)`;
  - `Core.habitDayPercent(habits, logsByHabit, date, today, weekRule)`;
  - `Core.habitWeekProgress(habit, logs, weekStart, today, weekRule)`.

## Tests (written first)

`tests/redesign-r8a.test.js`:

- the Core day state, the day share and the week progress, including weekly targets and skipped days;
- the header, the rings and the switch;
- Dan with its groups and meta, and a past day;
- Nedelja with the table and the legend;
- the bars and the chart;
- the folds;
- the toggles for a date and the value sheet for a date;
- the reset when the screen is opened;
- the version `2.0.0-alpha.13`.

`npm run smoke` adds: Navike → a ring of a past day → Dan for that day → Nedelja shows the table.
