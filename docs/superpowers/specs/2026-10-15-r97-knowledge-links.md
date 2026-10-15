# R97 — Beleške i resursi: links to projects and goals, link cards (data model)

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"; for Beleške i resursi: "Ne bih širio. Samo veza sa projektom i ciljem i pregled linka."). · **Release:** `2.0.0-alpha.124`. **Data-model change:** two optional fields on a note. Schema V3, IndexedDB v1 and ZIP `backupVersion: 2` stay.

## The fields

- **`note.relatedProjectIds`** and **`note.relatedGoalIds`** are arrays of ids, like a resource's. A note stores them only once it has a link, so older notes keep no field.
  - The note's informal `relatedTaskIds` (R35, a task made from the note) stays as it was.
- **Loading** (`Core.normalizeState`) keeps only the projects and goals that exist. The V3 check refuses a value that is not an array of ids, and sync pruning (`pruneDanglingReferences`) drops missing ones.

## The behavior

- **The note window:** "Organizacija" adds "Povezani projekti" and "Povezani ciljevi", the same sheets as a resource's (search, chosen first).
  - A link to an item that disappeared is refused: "Povezana stavka se promenila. Ponovo otvori belešku pre čuvanja."
- **What is linked shows where it belongs.**
  - The project screen gets a "Beleške i resursi · N" section under its tasks.
  - The goal details get the same list before Planiranje (`knowledge-linked` route, `linkedKnowledgeHtml` in the module context).
  - Rows are the usual note and resource rows, opening the item.
- **Link cards.**
  - In the note and resource window a link is a card: the site (without "www."), the rest of the address under it, and the open icon. An e-mail link shows its address.
  - Nothing is fetched from the link: no title or image comes from the network.
  - A note's row names the site of its first web link ("example.com +1") and has the same open button as a resource's.
- **Deletion:**
  - Deleting a project or goal removes it from notes as well (`buildDeleteSnapshot` effects), and Poništi puts it back.
  - Undoing a deleted note refuses when a linked project or goal no longer exists, as for resources.
- **Pages:** the guide's Projekti section gets a sentence. **Šta je novo** gets a line, and its range ends at alpha.124.

## Storage, backup and sync

- **`js/backup.js`:** for a note with the fields, each must be an array of existing project or goal ids (`Invalid backup: relatedProjectIds` / `relatedGoalIds`, or the missing reference).
- **Sync:** the fields travel inside the note record.

## Checks

- **Node:** `tests/knowledge-r97.test.js`, written first; it failed 6/6. It covers:
  - backup, sync and loading;
  - the window's relations, the link card, a note's row and the linked list;
  - the project screen and the goal details;
  - deletion and Poništi;
  - Serbian and the guide;
  - the version.
- **Older tests updated (with comments):** `redesign-r10b` (the note row's site and open button, the note window's two relations, the link card), and R96's version pin is now "or later".
- **Chromium:** see the ledger row.
- **Manual-pending:** the phone, and sync between two devices.
