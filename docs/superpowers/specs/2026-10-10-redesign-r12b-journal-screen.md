# Redesign R12b — Dnevnik and the entry window (design)

**Date:** 2026-10-10 · **Status:** implements J1, J2, J3, J5, J7 and J9 of `2026-10-08-redesign-decisions.md` (final 2026-10-09) on the collection from R12a · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.32`.

## What changes

1. **Place (J1).** "Dnevnik" sits in "Još" → Biblioteka, after Beleške, with the number of entries. The new module is `js/journal-ui.js`; it is loaded before `js/app.js` and precached. Its route is `#journal`.
2. **The screen (J3, J5, J7):**
   - **Header:** "Dnevnik", "N zapisa".
   - **The month:** its name with ‹ ›. The next arrow is disabled at the current month. The month is kept in `ui.journalMonth`.
   - **A strip of the month's days:**
     - each day shows its weekday and number;
     - today is marked;
     - a day with an entry shows its mood's face, or a dot without a mood (J7);
     - future days are disabled;
     - a tap opens that day's entry.
   - **Its own search field.** It filters the list by the entry text, ignoring case and diacritics, without redrawing the field. The query is kept in memory only, never saved. Global Search does not include the journal (J5).
   - **The entries:** newest first, those with text or a mood. Each row shows the day's date, its face and two lines of text; a row without text reads "Bez teksta".
   - **The empty states:**
     - "Dnevnik je prazan" ("Dodir na dan ili „+“ otvara zapis za taj dan.");
     - with a query, "Nema zapisa sa tim rečima" ("Pretraga gleda samo tekst dnevnika.").
   - **The floating "+"** opens today's entry and is labelled "Današnji zapis" (K12).
3. **The entry window (J2), a tall window "Dnevnik" with ⋯ and X:**
   - **The date as the title.** Below it is the day's read-only summary, "Završeno 3 zadatka · navike 1/6" (`Core.journalDaySummary`). It counts the tasks completed that day and the habits planned that day (weekly-target habits left out), with how many were done.
   - **"Raspoloženje":** five faces with their names (Loše, Slabo, Onako, Dobro, Odlično). A tap chooses a face, and a second tap clears it.
   - **The text field:** "Kako je prošao dan? Šta je bilo dobro? Šta sutra?". It saves while typing.
   - **The entry is created only by the first word or face,** so opening a day and closing it again leaves nothing. An entry emptied of text and mood is removed when the window closes.
   - **"+ Zadatak za sutra" (J9):**
     - It opens Quick Add planned for the day after the entry, or today when that day has passed.
     - The title comes from the selected text, or else from a "Sutra: …" line.
     - Creating the task or closing Quick Add returns to the entry.
   - **A note:** "Označen tekst ili red „Sutra: …“ postaje naslov zadatka. Čuva se dok pišeš. Dnevnik se ne vidi u Pretrazi, samo u svojoj pretrazi na ekranu Dnevnik."
   - **⋯ → "Obriši zapis":** it asks first, deletes the entry and offers "Poništi" (AGENTS delete policy).

## Compatibility

- **Data:** the R12a collection. No other data changes.
- **The faces** are emoji with the mood's name as their accessible label.

## Tests (written first)

`tests/redesign-r12b.test.js`:

- the "Još" row and the route;
- the month bar and its limit;
- the day strip with faces, dots, today and disabled future days;
- the search, ignoring case and diacritics;
- the list, its order and the empty states;
- the entry window's parts;
- the summary;
- moods, text saving and lazy creation;
- removing an emptied entry;
- delete with confirmation and Undo;
- "+ Zadatak za sutra" with the selection, a "Sutra:" line, the date rule and returning;
- the direct "+";
- the module being loaded and precached;
- the version `2.0.0-alpha.32`.

`npm run smoke` adds: Još → Dnevnik → "+" → Dobro → text → X → the entry is in the list → the screen's search finds it.
