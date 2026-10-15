# R98b — a habit from the habit window no longer breaks the ZIP backup and the automatic snapshot

**Date:** 2026-10-15 · **Status:** a bug found during the R98 check in Chromium. The automatic snapshot warning read "Automatski snimak nije uspeo: Neispravna rezervna kopija: endDate" after a habit was made in the new-habit window. · **Release:** `2.0.0-alpha.126`. No data-model change: the fields and their allowed values stay; only an invalid stored value is read as the value it meant.

## The bug

- Since R8b (`2.0.0-alpha.14`), `saveHabitModal` copied the window's draft into the habit as it was.
- The draft holds `endDate: ''` and `successfulPeriodsTarget: ''` when the habit has no such end, so every habit made or edited in the window stored empty text there.
- `Backup.validateDomain` accepts a date or null for `endDate` and a positive number or null for `successfulPeriodsTarget`. Empty text is neither, so:
  - **Napravi rezervnu kopiju** (the ZIP) failed with "Invalid backup: endDate";
  - the automatic recovery snapshot failed the same way, and the app showed the warning;
  - the phone's weekly automatic backup (R27) failed too.
- Habits from the examples, from templates and edited in the details sheet were not affected: they already stored null.
- The smoke test made such a habit but never ran the backup check, so the bug stayed hidden.

## The fix

- **The window:** `saveHabitModal` stores `endDate` only when the end is a date and `successfulPeriodsTarget` only when the end is a number of successful days; otherwise both are null, as `commitHabitDetails` already does. Editing a habit whose end changed clears the other field.
- **Data already stored:** `normalizeState` reads an empty `endDate` or `successfulPeriodsTarget` as null. Loading, saving, the snapshot and the state that arrives from sync all pass through it, so the habits made before this release are repaired. A real end date or count stays as it is.
- **Sync:** nothing changes in `js/sync.js`; a habit with empty text from a device on an older version is repaired when it arrives.

## Checks

- **Node:** `tests/habit-end-r98b.test.js`, written first; it failed 5/5. It covers:
  - a new habit without an end stores null and passes the backup check;
  - an end by date or by successful days keeps its value;
  - editing clears the end the habit no longer has;
  - loading repairs the empty text already stored;
  - the version and Šta je novo.
- **Smoke:** after all its flows, `tools/smoke-boot.mjs` now runs the backup check on the data they made. Without the fix it fails with "Invalid backup: endDate".
- **Older tests updated:** R98's version pin is now "or later".
- **Chromium:** see the ledger row.
- **Manual-pending:** the phone; a ZIP backup on a device that already has a habit made in the window.
