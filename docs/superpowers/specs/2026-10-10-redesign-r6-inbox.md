# Redesign R6 — Inbox (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.11`.

## What changes

1. **Top (I1).** The "Inbox" title and one line: "N stavki čeka razvrstavanje", or "Ništa ne čeka". The gray badge on the bottom item stays (R1).
2. **"Razvrstaj redom · jednu po jednu" (I2)** opens one item at a time, in a sheet with large buttons:
   - **for a task:** Danas, Sutra, Kad stignem and Projekat…;
   - **for a note, resource, goal or habit:** Otvori, Oblast… and Razvrstano.

   Below the buttons are a counter ("3 od 6") and "Preskoči". When the list is done, the sheet shows "Gotovo" and "Zatvori". The queue follows the current filter. Deleting is not offered here; it stays in the task window.
3. **Filters (I3)** show only the types that are in Inbox, with counts, and only when there are at least two types. A stored filter for a type that is gone falls back to "Sve".
4. **Groups by capture time (I4)** stay: Danas, Juče, Ove nedelje, Ranije.
5. **Quick buttons under every row (I5):**
   - **a task:** the Today row (R2) with Danas, Sutra, Kad stignem and Projekat…;
   - **another item:** its icon, title and type, with Otvori, Oblast… and Razvrstano.

   "Ukloni" is renamed "Razvrstano"; it only takes the item out of Inbox. The new "Oblast…" sets the item's area and takes it out of Inbox.
6. **Undo (I6).** Every sorting action shows a message with "Poništi": Danas, Sutra and Kad stignem (as before), Projekat… (new for a task that was in Inbox), Oblast… (new) and Razvrstano (new). An empty Inbox shows a check, "Inbox je prazan" and "Sve je razvrstano."

## Compatibility

- **Unchanged:** data; `INBOX_FILTERS`; the date grouping; the Inbox order of tasks (drag); Search.
- **Recurring tasks** still go through the "Samo ovaj / Ovo i buduća" question; the message then comes from that flow.

## Tests (written first)

`tests/redesign-r6.test.js`:

- the top line, the triage button and the empty state;
- the filters that are present and their counts;
- the task chips and the other-item rows;
- Razvrstano and Oblast… with Undo;
- Projekat… with Undo;
- the triage sheet (item, buttons, counter, Preskoči, Gotovo);
- the version `2.0.0-alpha.11`.

`npm run smoke` adds: Inbox → "Razvrstaj redom" → Danas plans the first task for today.
