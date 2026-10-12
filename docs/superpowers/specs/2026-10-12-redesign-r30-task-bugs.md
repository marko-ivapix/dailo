# Redesign R30 — task-side bugs from the third design pass (design)

**Date:** 2026-10-12 · **Status:** findings 1, 2, 3, 5, 6, 7 and 8 of `docs/superpowers/specs/2026-10-12-design-pass-3.md`, which the user approved with "moze sve". · **Release:** `2.0.0-alpha.56`.

## What changes

1. **Groups of Redovne obaveze in the project sheet** (finding 1).
   - **The bug:** a one-off task moved into a group such as "Dnevna soba" disappeared from every list.
   - **Which tasks see the groups:** the sheet (`projectPickerGroups`) offers them only to a repeating task or to one already in a group. They appear under their own title, "Redovne obaveze".
   - **Zadaci → Kad stignem:** it lists a task that sits in a group under the group's name, so a task already moved there is visible again.
2. **"Dodaj sve u Danas"** (finding 2).
   - **Undo:** Poništi is available ("Dodato u Danas").
   - **Repeating tasks:** they are left out. They keep their own "+ Danas", which asks "Samo ovo / Ovo i buduća".
   - **The button:** it shows only when at least one suggestion does not repeat.
3. **Quick Add reads Serbian hours** (finding 3). This amends the V1.10 grammar.
   - **Always a time:** "u 18h", "u 18" and "u 9:30".
   - **A bare "Nh":**
     - 9 to 23 is a time ("sutra 18h" → tomorrow 18:00);
     - up to 8 hours, and "24h", it stays a duration.
   - **An hour that does not exist** ("u 25h") leaves the title as typed.
   - **"za" before a duration** ("za 30 min", "za 2 sata") belongs to the duration. "za 3 dana" is still a date.
   - **The preview** shows durations through `durationLabel` ("1 h 30 min").
4. **First run** (finding 5).
   - **The card:** while the example tasks are untouched (the existing device-local fingerprint), Danas shows "Ovo su primeri" with two actions:
     - **Počni prazno:** empties every collection and keeps the settings. The button is the confirmation, and Poništi brings the examples back and shows the card again.
     - **Zadrži:** hides the card.
   - **Where the answer lives:** the device-local key `dailoSampleNotice`, outside state, sync and backups.
   - **Order with the transfer question:** in the phone app the "data from the web version" question comes first, and the card waits until it is answered.
   - **No late example:** "Pošalji fakturu klijentu" is due tomorrow, so the first Danas has no "Zakasnelo".
5. **Inbox → Projekat… → "Bez projekta"** (finding 6). It sorts the task out of Inbox, as in Quick Add, keeps its area and offers Poništi ("Zadatak je razvrstan"). Choosing a project still replaces the area.
6. **Reminders never start in the past** (finding 7).
   - **The choices:** quick choices that have passed are hidden.
   - **The starting point:** the sheet starts at the task's own time only while it is ahead; otherwise it starts at the first choice that is (`reminderStart`).
   - **"Primeni" on a passed time:** it shows "To vreme je prošlo. Izaberi kasnije." and saves nothing.
   - **The sentence:** it reads "Podseti me danas u 14:00", with the day name in lowercase.
7. **Danas links to "Predlozi za danas"** (finding 8).
   - **When:** while there are suggestions (due today, or a missed plan).
   - **The row:** Danas shows "Predlozi za danas · N ›".
   - **What it opens:** Zadaci, with the fold open.

## Checks

- **Node:** `tests/redesign-r30.test.js`. Older tests that pinned the replaced code (R2, R3, R4, R5, R6, R18, M9, V1.5, V1.6, V1.10) gained stubs or updated patterns, each marked R30.
- **Smoke:** the smoke test checks the examples card, "Počni prazno" and Poništi.
- **Manual-pending:** visual and device checks.
