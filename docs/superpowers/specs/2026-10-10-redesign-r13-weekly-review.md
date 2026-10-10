# Redesign R13 — Nedeljni pregled (design)

**Date:** 2026-10-10 · **Status:** implements S5 and J8 of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.34`. This is the last step of the phone redesign R1–R13; the desktop layer (K1–K12) stays deferred.

## What changes

The weekly review stays one screen (`#review`, `js/review-ui.js`) with six numbered steps, and gains a chart card and the journal row on top.

1. **"Poslednjih 7 dana"** (S5): a card with a chart and three numbers. The window is rolling (today and the six days before), since the review can happen before the end of the week.
   - **The chart** ("Završeni zadaci po danu"): seven columns of tasks completed per day, one series without a legend.
     - Each column is a button with a spoken label ("subota, 10. oktobar: 3 završena").
     - A tap selects it and shows the count under the chart. Today is selected first; the choice stays in memory.
     - The selected column shows its number.
   - **Three numbers:**
     - **Završeno:** the total, with the change against the previous 7 days ("▲ 3 prema prethodnih 7", "▼ 2 …" or "isto kao prethodnih 7").
     - **Stiglo:** tasks created in those 7 days, "novih zadataka".
     - **Navike:** the percent done this week so far, "urađeno ove nedelje". Days are counted from the week start to today: a habit's planned days and how many were done. A weekly-target habit counts its target, and at most the target as done.
   - **Core:** the numbers come from `Core.weeklyReviewStats(state, habitLogs, today, weekStartsOn)`.
2. **"Dnevnik ove nedelje"** (J8): under the card, the week's seven days.
   - **Each day shows:**
     - the mood's face;
     - ✎ for an entry without a mood;
     - · for no entry.
   - **Future days are disabled.** A tap opens that day's entry (R12b).
3. **The steps:**
   - **1. Isprazni Inbox** and **2. Kasni i propušteno:** when empty, the number turns into a green check and the header reads "· gotovo", with no body.
   - **3. Sledećih 7 dana:** one row per day, "ponedeljak, 12. okt" with "3 u planu · 1 rok", or "Slobodno". A tap opens that day in the Calendar (week view). The "Otvori Predstojeće" button leaves, since Predstojeće moved to the Calendar in R7 (C9).
   - **4. Ciljevi:** the Ciljevi rows (R9a).
   - **5. Navike:** one row per active habit, "niz 4 · 80%".
   - **6. Oblasti:** one row per area with its open tasks.

   Each step that has rows shows them in one card.
4. **The end:**
   - "Završi nedeljni pregled" as the big button. Afterwards a check line says when this week's review was done.
   - "Prethodni pregledi: …" lists the previous reviews.
   - The recorded reviews (`settings.weeklyReviews`) are unchanged.

## Compatibility

- **Data:** unchanged.
- **The Today notice (V1.11)** and the recording stay as they are.

## Tests (written first)

`tests/redesign-r13.test.js`:

- `Core.weeklyReviewStats`: completed per day, the totals and change, the created tasks, the habit percent with daily and weekly-target habits;
- the card and the column selection;
- the journal row with faces, pencils, dots and disabled days;
- the folded empty steps;
- the day rows opening the Calendar;
- the goal, habit and area rows;
- the finish states;
- the version `2.0.0-alpha.34`.

`npm run smoke` adds: Još → Nedeljni pregled → "Poslednjih 7 dana" with seven columns → a column shows its count → "Dnevnik ove nedelje" has today's face from R12b → Završi nedeljni pregled.
