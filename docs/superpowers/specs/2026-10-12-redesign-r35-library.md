# Redesign R35 — Biblioteka additions after the third design pass (design)

**Date:** 2026-10-12 · **Status:** additions A, B, H and I of `docs/superpowers/specs/2026-10-12-design-pass-3.md`, which the user approved with "moze sve". · **Release:** `2.0.0-alpha.61`.

## What changes

1. **Search on Beleške and Resursi** (A).
   - **The field:** each screen has its own search field above the chips. It appears once the screen has items.
   - **What it searches:** names, the text (or description), the clipped text, the author and the links.
   - **How it matches:** every word must appear, in any order, and diacritics do not matter.
   - **While typing:** only the results and the count ("1 od 2 beleške") redraw, so the field keeps the keyboard. The words stay while the screen is open.
   - **No match:** the screen says "Ništa nije pronađeno. Pretraga gleda nazive, tekst i linkove."
   - **Global Search:** it is unchanged.
2. **Filter sheets list only what is used** (A).
   - **Oblast and Oznaka:** each lists only the areas or tags that the items of this screen use, plus the one chosen now.
   - **"Bez oblasti":** it shows only when an item has no area.
   - The searchable link sheets came with R33.
3. **A note becomes a task** (B).
   - **Where:** the note's ⋯ menu has "Napravi zadatak" above "Obriši".
   - **The task:** it lands in Inbox.
     - **Title:** the note's name.
     - **Subtasks:** the note's list lines (`- `, `* `, `• `, `[ ] `, `[x] ` and `1. `), with `[x]` lines already done.
     - **Notes:** the other lines.
     - **Area and tags:** the note's.
   - **The link:** the note links the task through its existing `relatedTaskIds`.
   - **After that:** the task window opens, and the toast "Zadatak napravljen iz beleške" offers Poništi, which removes the task and the link.
   - **Core:** `Core.noteTaskDraft(note)` holds the pure rules.
4. **Links** (H).
   - **Sharing a link to Dailo:** an http(s) link shared to Dailo from Android or the installed web app opens a new resource in Inbox (`Core.sharedResourceDraft`).
     - **Name:** the shared title, or the one line shared with the link, or else the site.
     - **Link:** the shared link.
     - **Description:** any other shared text.
   - **Other text:** shared text without a link still opens Quick Add as before (`Core.sharedTextDraft`).
   - **A resource row:** it shows the site of its first web link in the meta line ("Članak · Nepročitano · example.org"). It also has a button that opens that link, with the name "Otvori link: example.org". In the phone app, the link opens in the system browser like every outside link.
5. **Starred notes on Još** (I).
   - **The Zakačeno group:** it also shows starred notes, the four most recently changed.
   - **No new data:** the star is the existing `favorite` field.
   - The weekly review tile's status came with R32.

## Data

- **No new field and no new key.** A note-made task is an ordinary task, and the link uses the note's existing `relatedTaskIds`.
- **Search state:** the search words live only in the open screen. They are not in state, backups, sync or device storage.

## Checks

- **Node:** `tests/redesign-r35.test.js`.
  - **Old tests updated:** R10b (the search field before the chips, area options only in use, the site in the resource meta, the `openKnowledgeWindow` options) and R24 (a shared link now opens a resource, and shared text still opens Quick Add).
  - **Version check:** R34's version check now reads "≥ 60".
- **Smoke:** the Beleške search finds the new note, and "Napravi zadatak" makes an Inbox task from it and opens the task window.
- **Manual-pending:**
  - sharing a link from Chrome on Android;
  - opening a resource link in the phone app;
  - visual checks.
