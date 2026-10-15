# R103 — Arhiva: old completed tasks move to IndexedDB v2 (data model)

**Date:** 2026-10-15 · **Status:** the user's decision. Asked whether the archive of old completed tasks should be done at the end, the user answered "Da, na kraju (Recommended)", after asking "da li mora indexedDB ili moze u supabase (sta je bolje resenje)?". Local IndexedDB keeps the app local-first; the server copy still comes through sync. · **Release:** `2.0.0-alpha.131`.

## Why

- The whole state lives in `localStorage` (about 5 MB in browsers) and is written whole on every save.
- Completed tasks only grow, especially the done occurrences of repeating tasks. Moving the old ones out keeps the saved state small and saving quick.

## Data model

- **IndexedDB `todoAppDB` goes from version 1 to 2.** The upgrade adds the store `archivedTasks` (`keyPath: 'id'`, index `completedAt`). The records are whole task objects, unchanged.
- **Unchanged:**
  - schema V3 and its validation;
  - ZIP `backupVersion: 2`. Archived tasks are written back into `data.tasks`, so older apps read the ZIP as before.
  - the sync records and the server tables. An archived task is still the record `tasks/<id>`.
- **Other tabs:** a tab still running the old code loses its database connection on the upgrade (`onversionchange`) and works again after a reload.
- The rules in `CLAUDE.md` and `AGENTS.md` now say IndexedDB v2.

## What is archived

`Core.archivableTaskIds(state, today, days = 180)` picks a task only when all of these hold:
- it is completed, and its local completion day is at least 180 days before today (`Core.ARCHIVE_AFTER_DAYS`);
- it has **no project**, so project bars, "N done" and the Completed fold of a project stay exactly as they were;
- it has no files (`attachmentIds`): files are kept only for the owners in the state;
- it has no goals (`goalIds`), so goal progress is unchanged;
- **nothing else in the data names its id.** Every string in the state is counted, and the task's own fields are subtracted. A resource's related tasks, a goal's tasks or the settings each keep a task live. Startup (`validateStateV3`) and backups (`validateDomain`) therefore keep passing.
- The task's own references to tags and its area could still dangle when one is deleted later. R103b handles that (below).

## When and how

**At start** (`archiveOldTasks`, after the start-up load and before sync starts):
1. the chosen tasks are written to `archivedTasks` in one transaction;
2. they leave `state.tasks` and the state is saved;
3. a task that changed in the meantime stays live, and its archived copy is removed;
4. if saving fails, the state is put back and the copies are removed.

**In memory:** `loadArchive` reads the store during the start-up load, so sync never runs before it. A task found both live and archived counts as live, and its stale copy is removed. If the archive cannot be read, `archiveFailed` keeps sync off.

## Where archived tasks still appear

- **Search:** `historyTasks()` = live + archived. Its ranking and scope are unchanged (tasks and projects).
- **Završeni zadaci:** the list and the "Postignuća" summary (R101).
- **ZIP backups:** `exportBackupV3` merges `storage.archivedTasks`, and the safety ZIP before a reset or restore includes them too.
- **Sync:**
  - `readLocal` hands sync the live and archived tasks together, so no deletion is ever sent for an archived task.
  - After a pull, `Core.splitArchived` decides what happens to each archived task:
    - one still archivable stays archived (its new version is written);
    - one changed elsewhere so it no longer qualifies comes back into the state;
    - one deleted elsewhere leaves the archive.
  - The live state is saved first and the archive is written after. If saving fails nothing changes, and a task coming back is never missing from both places.
- **The phone's file mirror (R76):** `dailo/archived-tasks.json` beside the habit logs and goal history. It is restored into an empty store with the rest.

## Bringing a task back

- **Any action** on an archived task brings it back into the state first: a click on any control with a task id (open, check off, menu), and `openTaskDetail`. The live copy is saved first, then the archived copy is removed. It is archived again at a later start if it still qualifies.
- **"Obriši završene zadatke"** first brings every archived task back, so they are deleted with the others (with Poništi as before).

## Reset, restore, recovery

`archivedTasks` is one of the user stores (`USER_STORES`), so global operations treat it like files, habit logs and goal history. A payload made before R103 (an older recovery copy) has no `archivedTasks` key; it means an empty archive, because its state still holds every task.

| Operation | The archive afterwards |
| --- | --- |
| **Reset (RESETUJ)** | empty |
| **Restore of a ZIP (VRATI)** | empty: the ZIP's tasks, archived ones included, go into the state, and the next start archives the old ones again |
| **Restore of one item** | unchanged |
| **Rollback, and Poništi after restoring one item** | the recovery copy brings the archive back |

After each of these the memory archive reloads (`loadArchive`).

## What does not see archived tasks

These are tasks older than 180 days without a project:
- **Kalendar:** past days more than 180 days back;
- **the journal:** an entry's "Završeno tog dana" for such days;
- **the weekly review:** unaffected, since it looks at the last 7 days.

## Pages

- The guide's "Tvoji podaci" gets a line.
- **Šta je novo** gets a line, and its range ends at alpha.131.

## Checks

- **Node:** `tests/archive-r103.test.js`, written first; it failed 9/9. It covers:
  - which tasks are archived;
  - the split after a sync;
  - IndexedDB v2 and the user stores (older payloads too);
  - the ZIP;
  - sync sends no deletion;
  - the app wiring;
  - the global operations and the mirror;
  - the rules and the pages;
  - the version.
- **Older tests updated (with comments):**
  - shape checks: `audit-fixes-m12`, `data-m2`, `durable-m5`, `redesign-r46`, `sync-app-v2-0a`;
  - harnesses that now load `historyTasks` with an empty archive: `decisions-m11`, `redesign-r10f`, `redesign-r10e`, `completed-summary-r101`;
  - harnesses that stub `loadArchive` or `archiveOldTasks`: `recovery-v1-5`, `recovery-v1-6`, `restore-journal-r78`, `final-integration-v1-5`;
  - R102's version pin is now "or later".
- **Chromium:** see the ledger row. It covers the real IndexedDB upgrade from version 1, the start-up archive, Završeni zadaci, Search, the ZIP, the automatic snapshot, reopening an archived task, and RESETUJ.
- **Manual-pending:**
  - the phone (the IndexedDB upgrade in the WebView and the file mirror);
  - two devices with sync, one with archived tasks;
  - a restore of a ZIP made before R103 on a device with an archive.

## R103b — fixes from the review (`2.0.0-alpha.132`)

A read-only review of R103 found these, and each is fixed:

1. **A deleted tag or area broke backups (high).**
   - **What happened:** an archived task kept the deleted tag or area. Every ZIP, and so every Reset and Restore with its safety ZIP, failed with "Invalid backup: … reference". Opening such a task with a deleted area made saving fail.
   - **Now:**
     - Deleting a tag or an area brings its archived tasks back first (`requestDeleteEntity`), so the delete and its Undo cover them.
     - `Core.pruneArchivedTask` drops tags and areas that no longer exist, for example after a deletion on another device. It runs:
       - when the archive loads, and writes the corrected copy back;
       - after a sync;
       - when a task comes back;
       - in the ZIP.
2. **Undo could delete a task that had come back from the archive (medium).** This was Undo after "Sve na sutra", "Zatvori dan → sutra", an `.ics` import or a series edit. `snapshotTasks` now records the ids of the live and archived tasks together.
3. **"Obriši završene" could bring deleted tasks back (medium).** If the state with the archived tasks could not be saved (a full storage), `unarchiveAll` now changes nothing and returns false, and clearing stops.
4. **Poništi after restoring one archived task always failed (medium-low).** The kept archive now leaves out the tasks the restore brings into the state, so the store matches what the recovery copy recorded.
5. **A failed archive write during sync was never repaired (low-medium).** The writes now set `archiveFailed` and fail the round. Sync stays off until the next start, and the same rows come again.
6. **Tasks bounced between the archive and the state (low).** After a sync only the records that are not archived count as naming a task (`splitArchived`), as at archiving.
7. **A failed archive load showed the old archive after a Reset (low).** `loadArchive` empties the memory archive first.
8. **Counts (low):** the Još tile and the "Obriši završene zadatke" card count the archived tasks too.
9. **Repeating tasks were never archived (design gap).** The links inside a series (`recurrence.seriesId`, `recurrenceSuccessorId`) are only compared or checked for presence and never looked up, so they no longer count as naming a task. The done occurrences of a repeating task without a project are archived now, the main growth this step was for.

**Left as notes:**
- A ZIP restore writes every task into the state first; a ZIP whose tasks fit only with the archive may need a reload after the restore.
- A failed archive read stops sync without its own message.

**Checks:**
- `tests/archive-r103b.test.js`, written first; it failed 5/5.
- `archive-r103` was updated with comments: the series link no longer keeps "named" live, plus the changed shapes and the version pin.
- Chromium: see the ledger row.
