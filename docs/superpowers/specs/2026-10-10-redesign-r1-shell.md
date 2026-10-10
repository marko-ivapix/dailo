# Redesign R1 — shell and navigation (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.5`.

## What changes

1. **Bottom navigation at every width** (G1): Danas, Inbox, Zadaci, Kalendar, Navike, Još.
   - "Ciljevi" leaves the bar and moves under "Još".
   - The desktop sidebar is no longer shown, since the desktop layer K1–K12 is deferred.
   - On a wide screen the bar sits under a centered 760 px column.
   - Keyboard shortcuts keep working.
2. **"Još" is a screen** (`#more`, M4), not a sheet. It has these cards:
   - **Zakačeno:** pinned areas and pinned saved views. The card is shown only when something is pinned.
   - **Planiranje:** Ciljevi, Oblasti, Čišćenje (renamed "Redovne obaveze" in R11), Nedeljni pregled, and Predstojeće until R7 moves it into the Calendar.
   - **Biblioteka:** Beleške, Resursi, Oznake, Šabloni, Sačuvani prikazi.
   - **Arhiva:** Završeni zadaci, Arhivirani projekti.
   - **Podešavanja,** with the sync state underneath.

   Each row shows a count where one exists. The bottom-sheet "Još" menu, its focus trap and its route list are removed.
3. **"Zadaci"** (`#tasks`, Z1 and Z3 as a first version):
   - the title and one summary line ("N otvorenih · M projekata");
   - a "Kad stignem / Projekti" switch, with "Kad stignem" as the default (remembered in `ui.tasksView`);
   - "Kad stignem" is the existing Anytime list;
   - "Projekti" lists the active projects with their open counts and "+ Novi projekat".

   R5 completes the screen (suggestions, grouping, project rows).
4. **"Bilo kada" becomes "Kad stignem"** everywhere in the Serbian UI (Z3).
5. **Active bottom item.** Routes under "Zadaci" (Anytime, Projects, one project) and under "Još" (goals, areas, the library, the archive, settings and their detail screens) light up their bottom item.
6. **Gray Inbox badge** (I1): the count stays, without the blue fill.
7. **No "+" in screen headers** (G2). The "Dodaj zadatak" header buttons are hidden; the floating "+" and the inline "+ Dodaj zadatak" rows remain.
8. **Search on Today** (T1, early): a magnifier icon in the Today header opens Search. Search used to be reachable from the removed sheet.

## Compatibility

- **Routes.** Every route still opens by its hash; nothing is removed from the app. Anytime and Projects stay reachable directly and from "Zadaci".
- **Unchanged.** Search scope, ranking and grouping; data; backups; sync.
- **Older tests.** The tests that pinned the old sheet and the old bar (`navigation-v1-7`, `design-v1-8`, `back-m4`, `ui-v1-6-today.py`) are rewritten to the new design, and each rewrite cites R1.

## Tests (written first)

`tests/redesign-r1.test.js`:

- the bar markup and order;
- the "Još" screen groups and links;
- the active bottom item for nested routes;
- the "Zadaci" switch and summary;
- the "Kad stignem" label;
- the CSS shell (no sidebar, a centered column, the bar at every width);
- the header "+" hidden;
- the Today search icon;
- the version `2.0.0-alpha.5`.

`npm run smoke` adds: open "Još" from the bar, open Ciljevi from it, and the Zadaci switch.
