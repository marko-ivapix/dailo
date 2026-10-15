# R92 — Navike for a beginner

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"). · **Release:** `2.0.0-alpha.119`. No data-model change.

## The change

- **The last 30 days.** `Core.habitRecentSuccess(habit, logs, today, weekRule, days = 30)` returns the share of planned days done in the last 30 days, or `null` when nothing was planned.
  - Skipped, unplanned and future days are left out. Today counts only once it is done.
  - It uses `habitCompletionForDates`, so a numeric habit's partial days and a weekly habit's periods count as they do in the 12-month view (R54). One missed day lowers it a little instead of resetting it like a streak.
  - **The habit row** on Navike reads "Svaki dan · niz 5 dana · 87% za 30 dana". A weekly habit reads "… · 1 / 3 ove nedelje · 87% za 30 dana".
  - **The details' fourth tile** is "Poslednjih 30 dana" instead of "Ostvareno ove nedelje"; the week stays in Uvid ("Ove nedelje: X od Y").
- **One line on Navike** under the day's habits: "✓ urađeno · ✗ upisano „nije urađeno“ (tog dana nema više podsetnika) · prazno: još ništa nije upisano. Niz raste samo sa ✓, a preskočen dan ga ne prekida." (`habits-legend`)
- **The habit window.**
  - In view: the name, Praćenje (with the target of a numeric habit), Učestalost and Podsetnik.
  - Oblast and Rutina move under "Više opcija", next to Početak, Kraj, Minimalna i idealna, Brze vrednosti, Povezani ciljevi and Trajanje. The fold's line is "Oblast, rutina, početak, kraj, ciljevi".
  - A new habit is "Dan" (daytime) and without an area unless chosen, as before.
- **The habit details.**
  - In view under "Podešavanja": Naziv, Oblast, Rutina, Praćenje, Učestalost and Podsetnici.
  - Under "Više opcija" (`toggle-habit-details-more`, kept while the window is open): Brze vrednosti, Minimalna i idealna, Dani tolerancije, Nastavak, Početak, Kraj and Povezani ciljevi.
- **Pages:** the guide gets a sentence. **Šta je novo** gets a line, and its range ends at alpha.119.

## Checks

- **Node:** `tests/habits-r92.test.js`, written first; it failed 7/7. It covers:
  - the 30 days: a missed day, a skipped day, today, a recent start, nothing planned;
  - the row and the tile;
  - the legend;
  - the window;
  - the details fold;
  - Serbian and the guide;
  - the version.
- **Older tests updated (with comments):**
  - `insights-v1-5`, `redesign-r8a`, `redesign-r8b` (window and Serbian) and `redesign-r8c` (tile, settings, Serbian);
  - the smoke boot opens the fold before Početak;
  - R91's version pin is now "or later".
- **Chromium:** see the ledger row.
- **Manual-pending:** the phone.
