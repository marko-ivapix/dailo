# R69 — "Treba da imam" in the examples

**Date:** 2026-10-13 · **Status:**
- **The request:** "da li mozes da mi napises i sta bi svaki muskarac trebao da poseduje?"
- **The pruning:** from the proposed 69 the user removed items 2, 11, 17, 18, 20, 21, 22, 24, 49, 55, 66, 67 and 69, and asked: "preradi: 1: samo 'tamno odelo', 51. samo 'power bank', 68 prebaci u nega".
- **Placement:** asked whether the list should be its own project or go into "Za kupovinu", the user did not choose. It became its own project, because "Za kupovinu" holds things for the home.

**Release:** `2.0.0-alpha.96`.

## The change

- **The project:** "Popuni primerima" (`js/starter-examples.js`) adds "Treba da imam" in the Lično area, after "Filmovi i serije".
- **Its tasks:** one task per group, with the kept things as subtasks, so each thing can be ticked when it is bought. That gives eight tasks and 56 things:
  - Odeća i obuća (15);
  - Nega (3; "Kvalitetan dušek i jastuk" moved here as asked);
  - Alat i kuća (11);
  - Kuhinja (6);
  - Auto i motor (6);
  - Tehnologija (5);
  - Dokumenti i novac (5);
  - Priroda i putovanja (5).
- **Reworded:** "Tamno odelo" (was "… koje dobro stoji") and "Power bank" (was "Prenosna baterija (power bank)").
- **Removed:** the white shirt, the plain T-shirts, the swim shorts, the training gear, the sunglasses, the wallet, the razor, the nail tools, the smartphone, the passport, the library, the hobby gear and the plant. The Lično group was left empty and is gone.
- **The tasks:** no dates, months or tags.
- **Code:** `TASKS` entries take `items` for subtasks.

## Checks

- **Node:** `tests/things-to-own-r69.test.js` was written first; all 5 of its tests failed. It covers:
  - the project, its area, groups, things and order;
  - the removed, reworded and moved things;
  - the place among the lists and the second run;
  - the Serbian names;
  - the version.
- **R66:** `tests/own-examples-r66.test.js` now expects the eighth project and 116 tasks, with an R69 comment.
- **Suites:**
  - `npm run verify`: 1239/1239.
  - `npm run smoke`: OK.
  - `npm run check:python`: 4/4.
  - `npm run check:links`: OK.
- **Manual-pending:** "Popuni primerima" on the phone, then "Treba da imam".
