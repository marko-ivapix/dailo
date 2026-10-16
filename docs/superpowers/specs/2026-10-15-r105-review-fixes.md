# R105 — fixes from the review of R83–R92

**Date:** 2026-10-15 · **Status:** the user asked "Slobodno odradi još promena i proveri da li je sve okej". A read-only code review of R83–R92 found the items below. Each was checked against the source and run in Node before it was fixed. · **Release:** `2.0.0-alpha.134`. · No data-model change: existing fields only.

## Fixed

1. **Editing a habit erased its duration (high, from R85 and R92).**
   - **Cause:** `habitDraft` had no `durationMinutes`. When "Više opcija" was open, the field showed empty and saving stored `null`.
   - **Now:** the draft carries the duration.
   - **Also:** the field steps by one minute. With `min="1" step="5"`, 30 was not a valid value and the arrows went 1, 6, 11.
2. **The Inbox add row lost words (medium, regression from R89).**
   - **Cause:** the R89 repeat and spoken-time readers ignore `parsePlan`. "Teretana utorkom" became "Teretana", and "Nazovi mamu u osam" became "Nazovi mamu".
   - **Now:** the row reads only `#tags` and `!priority` (R36), through `Core.parseQuickAdd(…, { slots: [] })`. Every other word stays in the title, and `+project` and `@area` stay as typed, since an Inbox task has no place.
   - The iPhone share path uses the same row.
3. **Templates dropped new fields (medium, from R88 and R85).**
   - "Od dana završetka" (`recurrence.afterCompletion`) is now kept in a task template and in a project template's tasks, as the R88 data-model spec said it would be.
   - A habit template keeps the duration. It is instantiated through `habitDurationOrNull`, so a habit without one gets no field.
4. **A tag whose name has a space was not read from its suggestion (medium, from R90).**
   - **Cause:** the suggestion writes `#kod-kuće`, and the parser compared tag names exactly.
   - **Now:** tags are matched with `looseName`, as `+project` and `@area` already were (without case, diacritics, spaces or dashes). So `#kuca` finds "Kuća" too.
   - An unknown tag still stays in the title.
5. **The 30-day success of a weekly-target habit was low and changed from day to day (low–medium, from R92).**
   - **Cause:** the partial first week was scored against the full target, and the open current week counted as a shortfall.
   - **Now:**
     - Only whole weeks inside the 30 days count, with every day of them scheduled (not before the start, not paused).
     - This week counts only once its target is met.
     - No whole week yet gives null, which shows no number.
6. **"do pola deset" was read as a planned 09:30 (low, from R89).** It now stays in the title, as "do 9:30" already did, since it is a deadline. "u pola deset" is still 09:30.
7. **A pasted list lost its leading day numbers (low, from R90).**
   - **Before:** "15. maj platiti račun" became "maj platiti račun".
   - **Now:** numbers are dropped only when the numbered lines count 1, 2, 3…. Bullets and check boxes go as before.
8. **What was typed before a paste was lost (low, from R90).**
   - The `+project`, `@area`, `#tags` and `!priority` typed before the paste now apply to every pasted task.
   - A line's own project, area or priority wins, and the tags are joined.
   - A day typed alone has no title to go with, so the parser does not read it; the sheet's day chip already applies to all lines.
9. **The day a repeat sets did nothing when tapped (low, from R90).** "Teretana utorkom" plans the first Tuesday, which has no words of its own. Its chip now keeps the repeat's words, so both go back into the title.
10. **"Zatvori dan" showed from a morning journal reminder (low, from R84).** The card waits for the later of the journal reminder time and 18:00.
11. **Undo of "Sve na sutra" and "Zatvori dan → sutra" removed newer tasks (low, from R83 and R84).**
    - **Cause:** `restoreTasks` drops every task not in the snapshot, which is right for series edits (they add occurrences) but wrong here. A task added by Quick Add or arriving through sync during the Undo window was deleted, and the deletion synced.
    - **Now:** these two moves use `restoreCopies`, which puts back only the moved tasks.

## Left as they are (noted)

- **The habit window for an existing habit has no way in.** It opens only through the `edit-habit` action, from a menu (`habit-menu`) that no current markup offers. Detalji navike edits in place and has no duration row, so an existing habit's duration cannot be changed in the app. Fix 1 still holds for that window; the missing row is for a later step.
- **Older app versions strip the R88 flag.** An app older than R88 on a second synced device rebuilds `recurrence` without `afterCompletion` and pushes it back. The fix is the same version on every device; it is part of the manual two-device check.
- **Quick Add false positives** that tap-to-keep undoes:
  - "Ručak sa Petkom" reads as a weekly Friday repeat;
  - "Iseci tortu u dva" reads as 02:00.
- **Style notes:** raw `px` values in some R83–R92 rules where tokens exist.
- **Speed:** the weekly path of `habitRecentSuccess` now walks at most five weeks per habit.

## Pages

- **The guide:**
  - a pasted list takes the `+projekat`, `@oblast`, `#oznake` and `!prioritet` already typed;
  - the 30-day success counts whole weeks for "X puta nedeljno".
- **Šta je novo:** one line, and its range ends at alpha.134.

## Checks

- **Node:** `tests/review-fixes-r105.test.js`, written first; it failed 12/12.
- **Older tests updated (with comments):**
  - `close-day-r84` and `today-overdue-r83`: `restoreCopies` in the harness;
  - `habit-duration-r85`: the step;
  - `habit-note-limit-r93`: the template pick list;
  - `quick-add-help-r90`: the preview's day slot and the paste's own parse;
  - `redesign-r36`: the Inbox row reads real tags;
  - R104's version pin is now "or later".
- **Manual-pending:** the phone (the habit window's duration field, pasting into Quick Add).
