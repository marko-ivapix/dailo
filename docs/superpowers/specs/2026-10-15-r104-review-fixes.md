# R104 — fixes from the reviews of R93–R103

**Date:** 2026-10-15 · **Status:** the user asked "Slobodno odradi još promena i proveri da li je sve okej". Two read-only reviews found the items below: a code review of R93–R102 and a security review of the branch against `main`. Each finding was checked against the source before it was fixed. · **Release:** `2.0.0-alpha.133`. · No data-model change.

## Fixed

1. **Sync stopped applying anything that arrived (high, from R97).**
   - **Cause:** `Core.pruneDanglingReferences` assigned the result of filtering a link list even when the field was missing. A note without `relatedProjectIds` (every note made before R97) got an own key holding `undefined`, and the V3 check (`invalid-notes-relatedProjectIds`) refused the whole pulled state.
   - **Effect:** pushes still went out, but nothing from other devices was applied, realtime included, and the round never moved on.
   - **Now:** only a list that is there is filtered, and a missing field stays missing. This covers tasks, projects, notes and resources.
2. **A mailto link with a stray "%" broke its window (medium, from R97).**
   - **Cause:** `decodeURIComponent` threw on, for example, `mailto:50%off@example.com`. The note or resource window then never opened, and its link could not be removed.
   - **Now:** an address that does not decode is shown as typed.
3. **A habit with an upper limit turned an empty day into a kept one (low–medium, from R93).** A limit habit reads no value as 0, which is within the limit.
   - **Now:**
     - Poništi after a quick value restores the day's earlier value, or empties the day when it had none (it used to write 0).
     - "Poništi preskakanje" on a number habit empties the day (it used to write "missed" without a value).
     - A yes/no habit keeps the R61 behavior.
4. **Enter while a word is still being composed** (IME, or an Android keyboard's underlined word) no longer runs the palette's choice or saves the day's note.
5. **The archived tasks that arrive through sync are normalized (low, from R103).**
   - **Before:** they went to IndexedDB as they came. A bad row could:
     - block every ZIP;
     - throw in `Core.pruneArchivedTask` (a `tagIds` that is not a list) after the state had already been replaced.
   - **Now:**
     - The archived tasks are pruned against the arrived tags and areas, then normalized together with the live tasks in the same `normalizeState` call. A bad row is repaired or refused the same way as a live one.
     - The device's archived tasks count as known, so none replays a past reminder.
     - Nothing changes until all of this has worked.
     - `pruneArchivedTask` reads a `tagIds` that is not a list as no tags.
6. **A pulled habit day's note** goes through `Core.habitLogNote`: one line of at most 200 characters, as when it is typed here. A longer one would block every ZIP.
7. **A sync paused because the archive could not be read now says so.**
   - `syncView().archiveError` makes the status line an error, so the tab's dot turns red.
   - Nalog shows "Sinhronizacija je zaustavljena: arhivirani zadaci nisu mogli da se učitaju. Ponovo pokreni aplikaciju."

## Left as they are (noted)

- **Mixed versions:** an app older than R93 on a second synced device drops a check-in's note when it writes that day again, and reads a limit habit as "at least". A device older than R97 likewise keeps the note links it does not know. The fix is to install the same version on every device; it is part of the manual two-device check.
- **Limit habits:**
  - "Uvid" before any check-in reads "0 / najviše 2 · U granici", which is true.
  - The notification's "Urađeno" logs the limit itself as the day's value.
- **Not repaired at load:** `loadArchive` and the phone's file mirror do not normalize records. Both hold only what this app wrote: archived from the normalized state, or arrived through sync, which is now normalized.
- **The palette's priority chips** in the weekly review are 44 px tall but about 38 px wide.
- **Habit-day notes sync as plain text**, outside the journal encryption, like task and note text. The privacy policy changes only with the user's approval.

## Pages

**Šta je novo:** one line, and its range ends at alpha.133. The guide needs no change.

## Checks

- **Node:** `tests/review-fixes-r104.test.js`, written first; it failed 7/7.
- **Older tests updated (with comments):**
  - the sync shape in `archive-r103`, `archive-r103b`, `audit-fixes-m12` and `data-m2`;
  - the quick-value Undo in `redesign-r37`;
  - R103b's version pin is now "or later".
- **Manual-pending:** two devices with sync, one of them with notes made before R97 (the first pull after updating).
