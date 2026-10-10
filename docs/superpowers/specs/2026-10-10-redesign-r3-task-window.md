# Redesign R3 — task window and pickers (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.8`.

## What changes

1. **Pickers are bottom sheets (E2).** Every popover becomes a bottom sheet: a dimmed backdrop, a grabber, the title and an X, then rows in cards. It is anchored to the bottom of the screen and as wide as the content column. A tap on the backdrop, Escape or Android Back closes it, as before. All existing popover actions keep working; only the presentation changes. The desktop popovers (E2, K6) belong to the deferred desktop layer.
2. **The task window (D1–D4, E1)** stays a window.
   - **Header:** "Zadatak" (or "Zadatak · u Inbox-u"), the ⋯ task menu and X.
   - **Top:** the title field and a project link ("Bez projekta" when there is none).
   - **Planiranje:** Planirano, Rok, Podsetnik, Ponavljanje, Trajanje.
   - **Organizacija:** Projekat, Oznake, Prioritet.

   Each row has an icon (Rok has its own, different from Planirano), the label, the value or "Nije podešeno", and "›". A row opens its sheet, and every change saves at once. Below the groups come:
   - "Podzadaci · done/total" with the add field;
   - Beleške and Prilozi;
   - "Više opcija" (folded): Oblast for a task without a project, Ciljevi, Važno and Hitno.

   At the bottom, one large "Završi zadatak" button ("Vrati kao otvoren" when done) is the only completion control; the checkbox by the title is gone.

   The ⋯ menu gains "Započni fokus" (T2a, S12) and keeps Sačuvaj kao šablon, Dupliraj and Obriši. The time fields move into the date sheet and the duration field into the Trajanje sheet. The "daily focus" row leaves, because nothing shows that list since R2.
3. **Date sheet (E4)** for Planirano and Rok, shared with Quick Add:
   - quick choices Danas, Sutra and "Sledeće nedelje" (next Monday);
   - a month calendar with ‹ ›, the selected day as a circle and today marked; it starts on the week start from Settings;
   - a Vreme row;
   - a note that the other date stays unchanged;
   - "Ukloni datum" and "Primeni".

   Planning a date takes a task out of Inbox, as before. Removing the date also removes its time.
4. **Priority (E5):** Bez, Nizak, Srednji and Visok, with flags in the G6 colors, and the note "Prioritet ne menja redosled". A tap applies the choice and closes the sheet.
5. **Reminder (E6):**
   - **Quick choices:** with a planned time, "U vreme plana", "15 min pre", "1 h pre" and "Dan pre u 9:00". Without one, "Kasnije danas" (not offered late in the evening, audit H-2) and "Sutra ujutru".
   - **The rest of the sheet:** date and time fields, the sentence "Podseti me {date} u {time}", the task's dates for reference, "Ukloni podsetnik" and "Primeni".
6. **Project (E8):**
   - a search field;
   - "Bez projekta";
   - the projects grouped by area, with "Oblast: …" under each name;
   - the note that the task takes the project's area;
   - "+ Novi projekat".

   A tap applies the choice.
7. **Tags (E9):** a search field, colored dots, several choices at once, "+ Nova oznaka", and "Primeni", which saves the selection in one change.
8. **Duration:** 15–120 min chips that apply at once, "Ukloni trajanje", and an "Drugo trajanje (min)" field with "Primeni".
9. **Repeat (E7):** the current choices and the custom form, inside a sheet. R11 brings the shared repeat editor (S15).

## Compatibility

- **Behavior.** Data, recurrence handling ("Samo ovaj / Ovo i buduća" still asks for any change of a recurring task until R11) and the task edit rules are unchanged.
- **Popover actions.** The existing set-plan, set-due, set-priority, set-project, set-reminder, set-repeat and toggle-tag actions stay for their other callers (task menu, Calendar, Quick Add until R4).
- **Older tests.** The tests that pinned the old window (`modal-ux-v1-6`, `design-v1-8` disclosures and popover) are rewritten, and each rewrite cites R3.

## Tests (written first)

`tests/redesign-r3.test.js`:

- the window markup, groups, rows and footer;
- the month grid;
- the date sheet for a task and for Quick Add;
- the priority, reminder, project, tags and duration sheets and what they save;
- popovers as sheets;
- the task menu's "Započni fokus";
- the version `2.0.0-alpha.8`.

`npm run smoke` adds: open a task, open Planirano, pick Sutra, "Primeni", and the task is planned for tomorrow.
