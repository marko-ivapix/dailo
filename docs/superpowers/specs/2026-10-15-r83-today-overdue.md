# R83 — Danas: past-due tasks without the pile, the backup reminder in Još

**Date:** 2026-10-15 · **Status:** the user's request, from an outside review of the screens. The user approved the list ("sve odradi osim ciljeva") and chose an exception to the AGENTS.md bulk rule for "Sve na sutra" ("Da, izuzetak"). · **Release:** `2.0.0-alpha.110`. No data-model change.

## The change

- **"Zakasnelo" on Danas** lists the open tasks whose deadline passed (`Core.isOverdue`). Missed plans stay in "Predlozi za danas". When the section has tasks, it gets two buttons:
  - **"Sredi jedan po jedan"** opens a pass (`overdue-triage`) over the past-due tasks, one at a time. It works like Razvrstaj redom and reuses its window.
    - The card shows "Rok je bio <date>" and the title.
    - **Danas / Sutra** move the deadline and the plan to that day and take the task out of Inbox (`overdueMoveChanges`), through `requestTaskEdit`. A repeating task asks "Samo ovo / Ovo i buduća", then the pass comes back.
    - **Novi rok…** opens the deadline picker, and **Bez roka** clears the deadline.
    - **Završi** completes the task, with the usual Undo.
    - **Otvori** opens the task window, which returns to the pass.
    - **Obriši** asks first, deletes with Undo, and then returns to the pass. `requestDeleteEntity` takes `{ returnTo }`, and Otkaži returns there too.
    - **Preskoči** moves on, and "N od M" shows where the pass is.
    - **Gotovo / "Ništa nije zakasnelo."** shows when nothing is left.
  - **"Sve na sutra"** (`moveAllOverdueToTomorrow`) moves every past-due task to tomorrow, both the deadline and the plan, in one step. "Zakasneli zadaci su pomereni na sutra" offers Undo, which restores every moved task.
    - A repeating task moves only this occurrence, as "Samo ovo" would (a `recurrenceBaseline` copy), so its series keeps its day.
    - **AGENTS.md** records the exception, the user's choice: one tap with Undo, still no selection of several items. R84's "Zatvori dan" is named there too.
- **The backup reminder** leaves Danas.
  - **At the top of Još:** the same card, with Izvezi and Podseti me sutra.
  - **The dot on the Još tab:** `backupReminderDue()` drives both the card and the R80 dot. The dot is amber (`.is-backup`, `--warning`) while a backup is due, and red when a sync failed. The red one wins, and the label follows ("Vreme je za rezervnu kopiju" / "Sinhronizacija nije uspela").
  - **The card's line with an account:** "Nalog čuva kopiju na serveru, a ZIP je kopija koju čuvaš samo ti." instead of "only on this device".
- **The guide** says where the reminder is now. **Šta je novo** gets a line and its range ends at alpha.110.

## Checks

- **Node:** `tests/today-overdue-r83.test.js`, written first; it failed 8/8. It covers:
  - the move;
  - "Sve na sutra" with a repeating task, Undo and a completed task left alone;
  - the Danas buttons;
  - the pass and its actions;
  - the card in Još and the dot;
  - AGENTS.md;
  - Serbian;
  - the version.
- **Older tests updated (with comments):**
  - `data-protection-v1-9`: the due helper, and the notice in Još, not Danas;
  - `redesign-r12c`, `redesign-r14`, `redesign-r2` and `transfer-m9`: the notices on Danas;
  - `redesign-r33`: the task window returns to the pass;
  - `redesign-r47c`: the main part's start;
  - `tasks-today-v1-6`: the buttons above the past-due list;
  - `sync-status-r80`: the dot;
  - `redesign-r15` and `more-menu-r72`: a stub for the card in Još;
  - `error-log-r82`: the version is now "or later".
- **i18n:** "Sync failed" gets its Serbian line, since the dot label now uses it in code.
- **Chromium (390 px)**, with four past-due tasks:
  - no backup card on Danas, and the amber dot on Još;
  - the pass: Sutra moved A, Obriši removed B after the question and came back to the pass, Završi completed C;
  - "Sve na sutra" moved D and the section disappeared, with "Zakasneli zadaci su pomereni na sutra";
  - the backup card was at the top of Još.
- **Manual-pending:** on the phone, the pass and the buttons, a repeating past-due task, and the dot.
