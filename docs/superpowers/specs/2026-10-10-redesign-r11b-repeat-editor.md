# Redesign R11b — the repeat editor (design)

**Date:** 2026-10-10 · **Status:** implements S15 and E7 of `2026-10-08-redesign-decisions.md` (final 2026-10-09) on the rule from R11a (`2026-10-10-redesign-r11a-recurrence-rule.md`) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.27`.

## What changes

The task window's "Ponavljanje" row opens one sheet, the repeat editor. On a wide screen it is a centered window (K6). It replaces the old popover with four choices and the "Prilagođeno" form (interval, a select and three end fields).

1. **Quick choices (chips):**
   - Svaki dan;
   - Svake nedelje (on the start's weekday);
   - Svakog meseca (on the start's day of the month);
   - Na 3 meseca (the same day, every 3 months);
   - Svake godine.

   The chip that matches the current choice is selected.
2. **Frequency:** a segment Dnevno / Nedeljno / Mesečno / Godišnje. A change sets the interval back to 1.
3. **Razmak:** a − N + stepper (1–99) with the unit: dan, nedelja, mesec or godina, in the right form.
4. **Nedeljno:** "Dani", seven day buttons from Monday to Sunday. At least one stays chosen; the start's weekday is the default.
5. **Mesečno:** two choices.
   - **"Dan u mesecu":** a grid 1–31 and "Poslednji dan". For 29–31 a note says "U kraćim mesecima pada na poslednji dan."
   - **"Dan u nedelji":** Prvi / Drugi / Treći / Četvrti / Poslednji and a weekday.
   - **Defaults:** from the start, e.g. the 10th, or the second Saturday; past the 28th it is "Poslednji".
6. **Godišnje:** a note says "Datum je dan prvog puta: 10. okt."
7. **The sentence and the next dates:**
   - **The sentence** (`recurrenceLabel`, also shown on the task window row and in Čišćenje), for example:
     - "Sredom i subotom";
     - "Radnim danima";
     - "Vikendom";
     - "Na svake 2 nedelje, ponedeljkom i petkom";
     - "Svakog 10. u mesecu";
     - "Na svaka 3 meseca, 10. u mesecu";
     - "Svakog poslednjeg dana u mesecu";
     - "Prvog ponedeljka u mesecu";
     - "Svake godine".
   - **The end** adds "· do 31. dec" or "· 10 puta".
   - **"Sledeći put":** the next three dates from today on. They start at the first matching day from the task's plan day, or else its due day or today, and respect the end (`Core.upcomingRecurrenceDates` with a `from` day). Without dates the line reads "Nema više ponavljanja."
8. **Kraj:** Nikad / Na datum / Posle broja ponavljanja, as radio rows.
   - The field of the chosen end opens right below: the date, 90 days after the start by default, or the count, 10 by default.
   - A bad date or count is refused with "Izaberi ispravan datum kraja ili broj ponavljanja."
9. **The existing controls stay at the bottom for a task that already repeats:**
   - Pauziraj / Nastavi ponavljanje;
   - Preskoči sledeći put;
   - Završi ponavljanje.

   Their wording, Undo and the narrower "Samo ovo / Ovo i buduća" question come in R11c (S14).
10. **Footer:**
    - **"Primeni"** saves the rule (`setRecurrence`). A repeating task still asks "Samo ovo / Ovo i buduća" as today. Applying an unchanged rule only closes the sheet.
    - **"Ne ponavlja se"** removes the rule from a task that has none yet, or from a draft. A repeating task ends its repeat with "Završi ponavljanje", as before.

The rule written is the R11a shape:

- weekly always carries `weekdays`;
- monthly always carries `monthMode` and its day;
- the end fields are written explicitly: `endDate` only for "Na datum", `endAfterOccurrences` only for the count.

A legacy rule opens in the editor with its day taken from the start, and is rewritten only when "Primeni" changes something.

## Removed

- The repeat popover's four options and "Prilagođeno interval…";
- the custom form (`showCustomRepeat`), its actions `set-repeat`, `show-custom-repeat`, `custom-repeat-cancel` and `custom-repeat-apply`;
- unused catalog entries.

## Compatibility

- **Data:** unchanged beyond R11a.
- **"Čišćenje":** keeps its own form until R11d.
- **Historical scripts:** the manual Playwright scripts `ui-v1-1-smoke.py` and `ui-v1-3-tools.py` used the old popover. They are historical browser checks, not run here.

## Tests (written first)

`tests/redesign-r11b.test.js`:

- **The sentences** in English, with their Serbian catalog entries.
- **The sheet:**
  - chips, segment, stepper, days, month modes, the yearly note, the next dates and the end;
  - the controls only for a repeating task.
- **Actions:**
  - presets, frequency, step, days (one stays), month mode and day, nth weekday, end;
  - Apply with the R11a rule, an unchanged rule, a bad end;
  - "Ne ponavlja se".
- **`Core.upcomingRecurrenceDates`** with a `from` day.
- **Removal:** the old popover code is gone.
- **CSS:** the R11b layer.
- **Version:** `2.0.0-alpha.27`.

`npm run smoke` adds: a task → Ponavljanje → Nedeljno → Sre + Sub (Sub is the start) → Primeni → the row reads "Sredom i subotom".
