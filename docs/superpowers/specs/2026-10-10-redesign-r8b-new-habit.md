# Redesign R8b — the new habit window and the frequency sheet (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.14`.

## What changes

1. **A window, not a page (N1).** "Nova navika" opens as a tall bottom sheet, like Quick Add. A big "Napravi naviku" button sits at the bottom. Without a name, the button asks for one ("Navika mora imati naziv."). A new habit stays on the current screen and shows "Navika je napravljena". "Izmeni naviku" opens the same window with "Sačuvaj izmene".
2. **First screen (N2, N3, N5).**
   - The name as a big field ("Šta želiš da vežbaš?").
   - Oblast: a row with "›" and a sheet; optional.
   - Rutina: Jutro / Dan / Veče; the default is Dan.
   - Praćenje: Kvadratić / Brojevno. "Brojevno" shows the target and unit right below: "Ciljna vrednost [2] [l] po danu".
   - Učestalost: a row opening the frequency sheet; the default is "Svaki dan".
   - Podsetnik: a row opening the reminder sheet with one or more times, "+ Dodaj vreme" and "Bez podsetnika".
   - "Više". The segmented choices use the neutral selected look; blue is only the main button.
3. **Under "Više" (N4),** rows with "›" that open small sheets:
   - **Početak:** the date sheet (Danas / Sutra / Sledeće nedelje, the month grid); the default is today.
   - **Kraj:** Nikad, Na datum, or after a number of successful periods (days, or weeks for "X puta nedeljno").
   - **Minimalna i idealna:** only for "Brojevno" and "X puta nedeljno". A blank minimum means the target and a blank ideal means the minimum, as the app counts them (the decision log says "the target" for both; the app's rule stays). The ideal must be at least the minimum. Changing the tracking, or switching to or from "X puta nedeljno", clears both.
   - **Brze vrednosti:** only for "Brojevno". They are suggested from the target (2 l → +0,25 +0,5 +1; 20 min → +5 +10 +20) until the person changes them, and they appear in the value sheet.
   - **Povezani ciljevi:** a multiple choice with "Primeni".
   - The note: "„Nastavak“ i „Dani tolerancije“ su u detaljima navike." Both settings are kept unchanged on a save.
4. **The frequency sheet (N6):**
   - The habit name sits under the title. The choices are Svaki dan, Određeni dani, X puta nedeljno and Na svakih N dana.
   - **Određeni dani:** seven day buttons; the working days by default. At least one day is required, otherwise "Primeni" is disabled.
   - **X puta nedeljno:** a stepper (1–7) and the note that a day counts once and the weekly target can be passed.
   - **Na svakih N dana:** the stepper in one row ("Na svaka 3 dana", 2–30), the start date (it is "Početak") and the next three dates.
   - One "Primeni". X closes without a change.
5. **Frequency labels** everywhere a habit's frequency shows:
   - Svaki dan;
   - Radnim danima;
   - Vikendom;
   - the chosen days;
   - Jednom nedeljno / N puta nedeljno;
   - Svaki drugi dan / Na svaka N dana.

## Removed

- The long form with selects, number fields and comma-separated reminder times.
- The "Cancel / Create" pair.
- Opening the new habit's page after creating it.

## Compatibility

- **Data:** unchanged. The habit fields and the validation of the old form apply as before: a numeric target above zero, 1–7 per week, at least one weekday, and an end date or a positive count.
- **The draft** (`habitDraft`) keeps every field, including those that left the window:
  - continuation and grace days;
  - disabled reminder records;
  - goal links from a template.
- **Serbian labels:**
  - "Checkbox" reads "Kvadratić" and "Numeric" reads "Brojevno";
  - "Selected weekdays" reads "Određeni dani" and "Every N days" reads "Na svakih N dana".

  They also show in the Saved Views and Templates fields.

## Tests (written first)

`tests/redesign-r8b.test.js`:

- the window's rows, segments, numeric target and "Više" rows;
- creating with and without a name, and the toast;
- the frequency sheet's four choices, the steppers, the weekday rule, the next dates and "Primeni";
- the reminder sheet with several times;
- the start, end, minimum and ideal, quick values, area and goals sheets;
- the frequency labels;
- the version `2.0.0-alpha.14`.

`npm run smoke` adds: "+" → Navika → a name, Brojevno, Učestalost → Određeni dani → Primeni → Napravi naviku → the habit exists with weekdays.
