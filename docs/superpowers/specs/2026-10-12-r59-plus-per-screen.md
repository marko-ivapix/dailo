# R59 — the "+" adds what the screen is about

**Date:** 2026-10-12 · **Status:** the user's request: "Kada sam u zadatku i kliknem na plus treba da mi pravi zadatak, to isto važi i za navike, ciljeve, oblasti, redovne obaveze, beleške, oznake itd". · **Release:** `2.0.0-alpha.86`.

## Before

A check of every screen in the real page (jsdom) showed what a tap on the floating "+" did on the phone:

- **The screens with their own type** already added their own item directly: Navike, Ciljevi, Oblasti, Redovne obaveze, Beleške, Resursi, Oznake, Šabloni, Sačuvani prikazi and Dnevnik (`QUICK_ADD_DIRECT`, R9c–R11e).
- **The task screens** (Danas, Inbox, Zadaci, Kalendar, a project, an area, a tag) opened the menu with every type, so a task took two taps.

## The change

- **Task screens:** "+" opens a new task at once.
  - **Where:** Danas, Inbox, Zadaci, Kalendar, a project (including "Bez projekta"), an area and a tag (`TASK_SCREENS`, `NEW_TASK_HERE`). The label says "Novi zadatak".
  - **Context:** the task gets that screen's context through `routeQuickAddContext`:
    - Danas plans it for today, and Kalendar for the shown day (today when the shown day is in the past).
    - A project or an area files it there.
    - "Bez projekta" keeps it out of Inbox.
    - **New:** a tag's screen gives the task that tag (`tagIds` in `openQuickAdd`).
- **Holding "+":** where a tap adds directly, holding "+" opens the menu with every type (Zadatak, Cilj, Navika, Beleška, Resurs, Projekat) over the scrim. Every type therefore stays one hold away. Where a tap opens the menu, holding it still opens a new task, as in R36.
- **Closing the menu:** a tap on the "+" of the open menu closes it.
- **Unchanged:**
  - The menu stays on the screens without their own type: Još, Podešavanja, Nalog, Nedeljni pregled, Završeni zadaci and Arhivirani projekti.
  - A saved view keeps the menu too, because it can show tasks or habits.
  - On a wide screen the "+" still never opens the menu (R47a).

## Checks

- **Node:** `tests/plus-r59.test.js`, written first; it failed 5/5. It covers:
  - the direct task on every task screen, with its context;
  - the other screens' own items, and the menu screens;
  - the tag context;
  - the hold and the closing tap;
  - the version.
- **Older tests updated, with comments:** `tests/redesign-r9c.test.js`, `tests/redesign-r10b.test.js`, `tests/redesign-r36.test.js`, `tests/redesign-r47a.test.js` and `tests/security-r58.test.js` (the version).
- **Smoke:**
  - "+" on Danas opens a new task;
  - holding "+" opens the menu over the scrim, and the scrim closes it;
  - "+" on "Bez projekta" opens a task placed there.
- **Manual-pending:** the tap and the hold on the phone.
