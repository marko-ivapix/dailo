# Redesign R41 — paging through weeks on Navike

**Date:** 2026-10-12 · **Status:** asked for by the user with a screenshot of Navike → Nedelja: "mislim da bi bilo dobro da mogu da listam jednu nedelju pre i posle". · **Release:** `2.0.0-alpha.67`.

## The change

- **The bar:** above the rings a bar shows ‹ the week's range ›.
  - **The range:** for example "12.–18. oktobar".
  - **Its name:** "Ova nedelja", "Prošla nedelja" or "Sledeća nedelja" when it is one of those.
  - **Coming back:** outside this week a pill "Ova nedelja" returns to it.
- **How far it goes:**
  - **Back:** ‹ goes back to the week the first active habit started, so a habit's history can be read week by week.
  - **Forward:** › goes one week ahead and no further, so the coming week's plan can be seen.
- **The rings and both views follow the shown week:**
  - **Rings:** future days stay inactive, as before.
  - **Dan:** it keeps the same weekday in the new week, never after today. In a week before it starts, it shows one line pointing to Nedelja.
  - **Nedelja:** its cells record a past day as they did for this week. Its range title is gone, because the bar above shows it.
  - **Days ahead:** in this week and the next, a day the habit is not planned on shows the dash, like a past unscheduled day. Before, every future day looked the same.
- **The progress section:**
  - **"Po navici":** it follows a past week ("Po navici · 5.–11. oktobar") and stays on this week while next week is shown.
  - **The month chart:** it is unchanged.
- **The state:**
  - **What is stored:** the shown week is `ui.habitsWeekStart`, the first day of the week, where `null` means the selected day's week.
  - **Opening Navike:** it starts on the selected day's week, so "Juče nije zabeleženo" on a Monday opens last week.
  - **Out of range:** a stored week outside the range is clamped.
- **Unchanged:** nothing in the data model, backups or sync changes. `ui` is device state.

## Checks

- **Node:** `tests/redesign-r41.test.js`, written first; it failed 8/8. It covers:
  - the bar on this week, last week and next week;
  - the rings and the selected weekday;
  - the "not started" line;
  - the planned and unplanned days ahead;
  - the bars;
  - the ends of the range and clamping;
  - the actions;
  - the reset on opening;
  - the style;
  - the Serbian strings.
- **Old tests:** R8a now expects the reset on opening, and R40's version test now reads "≥ 66".
- **Smoke:** › shows next week with inactive rings, and "Ova nedelja" comes back.
- **Manual-pending:** the look and touch on a phone.
