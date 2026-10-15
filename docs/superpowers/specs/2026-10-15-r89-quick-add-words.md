# R89 — Brzo dodavanje: spoken times, repeats and Cyrillic

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"). · **Release:** `2.0.0-alpha.116`. No data-model change: a repeat written in the title becomes the task's ordinary `recurrence`.

## The change

All of it is in `Core.parseQuickAdd`, which still reads trailing clauses right to left. Words are compared without case and diacritics (`plainWord`), so "cetvrt" and "uvece" work too.

### Spoken times (`quickSpokenTime`)

- **Patterns:**
  - "pola deset" is 9:30 and "četvrt do osam" is 7:45; both also work after "u".
  - "četvrt posle osam" is 8:15.
  - After "u": "osam i četvrt" is 8:15, "osam i po" is 8:30 and "osam" is 8:00.
  - Hours are 1–12 as words or 1–24 as digits ("pola 10").
- **Morning and evening:**
  - "ujutru" / "ujutro" keeps the morning.
  - "uveče" / "popodne" adds twelve hours ("u 8 uveče" is 20:00, "u pola devet uveče" 20:30, "u tri popodne" 15:00).
  - "pola jedan" and "četvrt do jedan" are around noon (12:30, 12:45).
- **Quantities stay in the title.** "X i po" and "X i četvrt" need "u", and a bare number word is not a time: "Pretrči pet i po", "Kupi dva i po", "Pojedi pola jabuke" and "Kupi osam" are unchanged.

### Repeats (`quickRepeat`, a new `recurrence` slot)

- **On a weekday:**
  - "utorkom", or two days with "i" ("ponedeljkom i četvrtkom");
  - "radnim danima" (Mon–Fri) and "vikendom" (Sat, Sun);
  - "svakog utorka" (and the other weekdays in the genitive; "svake nedelje" is every week, Sundays are "nedeljom").
- **By a unit:**
  - "svaki dan", "svakog dana" and "svakodnevno";
  - "svake nedelje", "svakog meseca" and "svake godine".
- **With a step:**
  - "svakog drugog utorka", "svake druge nedelje" and "svakog trećeg dana" (ordinals 2–4);
  - "svaka 3 dana", "svakih 6 meseci" and "svake 2 godine" (1–99).
- **English:** "every day / week / month / year", "every monday", "every other monday" and "every 3 days".
- **A repeating task's first day.** With no day written (and the plan not picked in the sheet), the task is planned for its first day from today (`firstRecurrenceDate`). A written day or time still counts ("utorkom u 20h", "svakog meseca 1.11.").
- **In the sheet:** the preview shows the repeat with its sentence ("Utorkom", "Svaka 3 dana"), and a repeat picked in the sheet wins over the written one.

### Cyrillic typing

- The clauses are read on a Latin copy of the words (`cyrillicToLatin`), while the title keeps the words as typed: "Купи млеко сутра у 9:30" becomes "Купи млеко" tomorrow at 9:30.
- #tags, +projects, @areas and !priority match in Cyrillic too (`looseName` and the tag and priority comparisons).

### Guide

- The Quick Add list gets "Vreme" and "Ponavljanje" lines, and the guide says the words are also recognized when typed in Cyrillic. The public pages stay in Latin script.
- The FAQ gets an example with a repeat.
- **Šta je novo** gets a line, and its range ends at alpha.116.

## Checks

- **Node:** `tests/quick-add-words-r89.test.js`, written first; 7 of its 8 tests failed. The quantities test passed from the start, as a guard. It covers:
  - the times;
  - the quantities;
  - the repeats;
  - the first day and the combinations;
  - Cyrillic with tokens;
  - the preview and the task;
  - the guide;
  - the version.
- **Older tests:** R88's version pin is now "or later".
- **Chromium:** see the ledger row.
- **Manual-pending:** dictation on a phone.
