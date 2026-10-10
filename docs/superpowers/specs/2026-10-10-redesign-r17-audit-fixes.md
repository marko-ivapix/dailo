# Redesign R17 — fixes from the design audit (design)

**Date:** 2026-10-10 · **Status:** the user asked for a pass over the whole design ("prodji kroz ceo dizajn i vidi da li nesto treba da se ispravi"). The audit listed twelve items, and the user answered "da, ispravi sve 1–12". The step applies the R14 patterns (text first, the date under the title, the round check on the right) wherever they were still missing · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.40`.

## What changes

1. **"Bez projekta" opens its screen.**
   - **The bug:** the row in Zadaci → Projekti led to `#project/none`. `currentRoute` accepted only real projects, so it fell back to Danas.
   - **The fix:** the route now accepts `none`, and the domain context hands over `taskRow`, which the screen needs.
2. **The Još tiles' icons are 36 × 36.** An older rule (`.mobile-more-route > i:first-child`) narrowed them to 20 px wide.
3. **The task window's title is 22 px on phones.** The 16 px rule that stops iOS from zooming into small fields also shrank the title, which is already larger than 16 px.
4. **No "Instaliraj aplikaciju" in the phone app.** Inside the Capacitor app, Dailo counts as installed, so the Safari instructions no longer show in Pomoć.
5. **A toast never covers the "+".** The "+" moves up while a toast shows, at every width (before, only below 1024 px).
6. **No invisible buttons on touch screens.**
   - **On a touch screen:** the ⋯ of a task row is hidden, because the task window has its own ⋯.
   - **With a mouse:** the ⋯ still shows on hover.
   - **Subtasks:** the × that deletes a subtask is visible on touch screens.
7. **The round check on the right, in the four places it was still on the left:**
   - subtasks in the task window: the title, ×, then the check; the "Dodaj podzadatak" field no longer leaves room for a check;
   - subtasks in Fokus: the title, then the check;
   - Nedeljni pregled, steps 1 and 2: the rows are the usual task rows. Inbox tasks keep the Danas / Sutra / Kad stignem / Projekat… chips, and late tasks get "+ Danas";
   - Pretraga: a task result has no circle on the left. A done task shows a green check on the right. Scope, ranking and grouping are unchanged.

   The rarely used `#anytime` list also uses the usual task rows.
8. **The date or count under the title, not on the right:**
   - milestones in "Novi cilj";
   - habit rows: the week count ("2/4 nedeljno") or the value ("1,5 / 2 l") joins the meta line under the name, on Danas, Navike → Dan and in the habit details;
   - Nedeljni pregled, steps 5 and 6: habit and area rows put their line under the name.
9. **No "›" arrows in list rows.**
   - **Where they go:** Oblasti, Oznake, Šabloni, Sačuvani prikazi, the project rows in Zadaci → Projekti and on an area, and "Bez projekta".
   - **Why:** most lists (Ciljevi, Beleške, Resursi, Dnevnik, Arhivirani) already have no arrow.
   - **Where they stay:** settings-like rows that open a sheet ("Planirano ›") keep theirs.
10. **The project screen has the usual header.**
    - **Above the header:** "‹ Zadaci".
    - **The header:** the project's color dot and name, its summary line, the search button and the bordered ⋯ (`pageHeader` gains a `color` option).
    - **"Bez projekta"** gets the same header.
11. **Empty states:**
    - **An open project without open tasks:** "Nema otvorenih zadataka."
    - **"Bez projekta" with nothing in it:** "Nema razvrstanih zadataka bez projekta."
    - **Sačuvani prikazi without views:** "Još nema sačuvanih prikaza. „+“ čuva filtere koje često koristiš."
    - **Predstojeće with nothing coming up:** the usual empty state, with a line of explanation.
    - **Pretraga:** its empty states lose their inline styles.
12. **"Novi projekat" is a sheet like "Nova oblast".**
    - **The layout:** a big name field, the colors, and one big button ("Napravi projekat" / "Sačuvaj izmene").
    - **The behavior:** validation, saving and the color choice are unchanged.

## Compatibility

- **Data:** unchanged.
- **Search:** behavior is unchanged.
- **Behavior:** only the order of row parts and the CSS change.
- **Older tests** that pinned the old markup are rewritten with an R17 note.

## Tests (written first)

`tests/redesign-r17.test.js` covers the twelve items: the route and context, the CSS rules, the native install check, the toast lift, the touch rules, the new orders of subtasks, focus subtasks, review rows and search results, the meta lines, the removed arrows, the project header, the empty states, the project window, and the version `2.0.0-alpha.40`.

`npm run smoke` adds:

- Zadaci → Projekti → "Bez projekta" opens its screen;
- the Još tile icon box;
- the project window's big button.
