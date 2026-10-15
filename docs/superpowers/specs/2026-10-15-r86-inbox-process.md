# R86 — Inbox is for emptying

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"). · **Release:** `2.0.0-alpha.113`. No data-model change.

## The change

- **No type filters.** Inbox always lists everything, grouped by when it was captured (Danas, Juče, Ove nedelje, Ranije).
  - The filter pills, their handler (`inbox-filter`) and their styles are gone.
  - "Razvrstaj redom" always takes everything in Inbox.
  - The stored `ui.inboxFilter` stays valid in `normalizeState`, so the stored ui keeps its shape, but nothing reads it.
- **Razvrstaj redom gets two more ways out for a task:**
  - **Završi** (`inbox-complete`) completes the task on the spot through the same `toggleComplete` as everywhere, with its Undo.
  - **U beleške** (`inbox-to-note`, `inboxTaskToNote`) is for a task that was really a note:
    - a new note gets the title, the task's notes and the subtasks as list lines (`- [ ]` / `- [x]`), with the task's area (or its project's) and its tags;
    - the task leaves through the delete snapshot (`buildDeleteSnapshot` → `applyDeleteSnapshot`), so links to it from resources, goals and other tasks come back with Undo ("Prebačeno u beleške");
    - Undo restores the task and removes the new note;
    - a task with files stays a task, so the button is not offered (files would need moving between owners).
  - The order is Danas, Sutra, Kad stignem, Datum…, Projekat…, Završi, U beleške, Otvori.
- **The guide** says what lands in Inbox: a task without a day and without a project, also from the voice, the widget and "Podeli u Dailo", and how Razvrstaj redom empties it.
- **Šta je novo** gets a line, and its range ends at alpha.113.

## Not changed

- Search ranking and scope.
- Non-task items in Razvrstaj redom (Otvori, Oblast…, Razvrstano).
- Razvrstaj redom still offers no Obriši.

## Checks

- **Node:** `tests/inbox-process-r86.test.js`, written first; it failed 6/6. It covers:
  - no filters, and everything in the list and the pass;
  - the two buttons and their handlers;
  - the note made from the task, the delete snapshot and Undo;
  - the guide;
  - Serbian;
  - the version.
- **Older tests updated (with comments):**
  - `inbox-v1-6` (×2), `redesign-r22b` and `redesign-r6` (I1): no filters;
  - `redesign-r36` (G) and `redesign-r6` (I2): the two new buttons;
  - R85's version pin is now "or later".
- **Chromium (390 px):** see the ledger row.
- **Manual-pending:** the phone.
