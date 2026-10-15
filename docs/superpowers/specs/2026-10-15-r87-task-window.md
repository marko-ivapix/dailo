# R87 — Zadaci: Kad radim and Rok, a short task window, buttons for gestures

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"). · **Release:** `2.0.0-alpha.114`. No data-model change.

## The change

- **Two dates with plain names.** The planned day is called **Kad radim** (English key "When I do it"); the deadline stays **Rok**.
  - The new name is used in the task window, the date sheet's title and its note ("„Kad radim“ ostaje isto: …", "„Kad radim“ nije postavljeno."), the reminder sheet's task dates, Fokus ("Kad radim: …"), the saved-view filters and the template editor ("Vreme kad radim").
  - The guide explains the two: Kad radim is the day you plan to do it (then it is on Danas), Rok is the day it must be done by. Its Quick Add list says "Kad radim:" too.
- **A short task window.** In view are the title, the project link, Kad radim and Rok, and whatever the task already has:
  - the rows Okvirno, Podsetnik, Ponavljanje, Trajanje, Oznake, Prioritet, Oblast (a task without a project) and Ciljevi, in that order, once they are set;
  - Podzadaci, Beleške and Prilozi once they have something.
  - Everything empty waits under **Više opcija**. Its line names the first three waiting fields (podsetnik, ponavljanje, podzadaci, beleške, trajanje, oznake, prioritet, okvirni mesec, prilozi, oblast, ciljevi), with "…" when there are more.
  - A project task's area (read-only) stays in the fold.
  - With nothing left to fold, there is no fold.
  - The fold is closed when the window opens. Once opened, it stays open while the window lives (`modalState.moreOpen`), so a field set from inside it moves up without the fold snapping shut.
  - The Planiranje and Organizacija headings are gone.
- **Every gesture has a button:**
  - **Swipe right** (complete): the circle on the row.
  - **Swipe left** (pick the date): "Planiraj za…" in the row's ⋯ menu, or the Kad radim row in the task window.
  - **Hold and drag** (order): **Pomeri gore** and **Pomeri dole** in the task's ⋯ menu.
    - It moves the task one place within its own list, as a drag onto its neighbour would (`reorderNeighbours`, then `reorderTasks`), and says "Pomereno gore" / "Pomereno dole".
    - On an Inbox row the move stays within its capture group.
    - On a phone the rows have no ⋯, so the menu in the task window offers it too: the menu finds the task's row on the screen behind.
  - **Dragging a subtask:** while a subtask is renamed (tap its title), **↑** and **↓** next to the title field move it, and Alt+↑ / Alt+↓ do the same on a keyboard.
    - The field keeps the focus, and the subtask stays in edit mode, ready to move again.
    - A renamed subtask of a repeating task first asks "Samo ovo / Ovo i buduća", as before.
  - **Holding "+"** opens the menu, which a tap opens on Još and the other non-type screens. Every type also adds from its own screen.
  - **The habit menu** opens with a tap on the habit's name.
  - **Navike's week swipe** has ‹ and ›.
  - **A sheet's grabber** has ×.
  - The guide and the FAQ say this.
- **Šta je novo** gets a line, and its range ends at alpha.114.

## Not changed

- Search, the data model and the gestures themselves.

## Checks

- **Node:** `tests/task-window-r87.test.js`, written first; it failed 8/8. It covers:
  - the names in every place;
  - the short window for a new task;
  - the window for a full task, the fold staying open, and no fold when nothing is empty;
  - `reorderNeighbours` (with an Inbox group) and the menu;
  - the subtask arrows;
  - the guide and the FAQ;
  - Serbian;
  - the version.
- **Older tests updated (with comments):**
  - `design-v1-8` and `modal-ux-v1-6`: the fold and no headings;
  - `redesign-r3`: the row order, the fold's line and "Kad radim" in the sheets;
  - `redesign-r10d` (saved views) and `redesign-r10f` (Fokus): "Kad radim";
  - `redesign-r33`: the fold's line, and stubs for the menu;
  - R86's version pin is now "or later".
- **Chromium (390 px, touch):** see the ledger row.
- **Manual-pending:** the phone.
