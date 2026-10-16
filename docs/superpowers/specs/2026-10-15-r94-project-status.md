# R94 — A project's status and its next step (data model)

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"; for Projekti: status "aktivan / na čekanju / nekad", "sledeći korak", and the weekly review pointing at projects without a next task). On the hierarchy the user chose "Ostaje kao sada": a project can still belong to an area, and no Oblast → Cilj → Projekat chain is added. · **Release:** `2.0.0-alpha.121`. **Data-model change:** one optional field on a project. Schema V3, IndexedDB v1 and ZIP `backupVersion: 2` stay.

## The field

- **`project.status`** is `'onHold'` ("Na čekanju") or `'someday'` ("Nekad"), stored only for those two.
  - **Absent:** the project is active ("Aktivan"), as every project was before.
  - `Core.normalizeState` deletes any other value. `Core.projectStatus(project)` reads `'active'`, `'onHold'` or `'someday'`.
  - The status is separate from `isArchived`: an archived project keeps its status for when it is restored. A group of Redovne obaveze (`isCleaningRoom`) has no status switch.
  - A project template does not carry it, so a project made from a template is active.

## The behavior

- **Kad stignem.** The undated tasks of a project on hold or for someday stay out (`Core.deriveAnytime(tasks, projects)`; without projects it reads as before).
  - A line under the list says how many wait there: "1 zadatak čeka u projektu na čekanju ili za nekad."
  - Tasks with a planned day or a deadline still show where their date puts them (Danas, Kalendar, the suggestions), so no deadline is hidden.
- **Zadaci → Projekti** lists the active projects by area, as before. Below them, "Na čekanju · N" and "Nekad · N" fold (`toggle-projects-resting`, remembered in `ui.projectsOnHoldOpen` / `ui.projectsSomedayOpen`).
- **The project row** (here and on an area's screen):
  - an active project shows its next step, "Sledeće: …", or "Nema sledećeg koraka" in amber;
  - a project on hold or for someday shows its status instead.
- **The next step** of a project is its first open task in the project's order (`projectTasks(id)[0]`). Moving a task to the top makes it the next one, so it needs no field.
- **The project screen:**
  - a switch "Aktivan · Na čekanju · Nekad" under the header (`project-status` → `setProjectStatus`, a plain edit);
  - for a project that is not active, a line: "Njegovi zadaci bez datuma nisu u „Kad stignem“ dok ponovo ne bude aktivan.";
  - an active project marks its first open task "Sledeći korak" in the row's meta line (`taskRow` option `nextStep`).
  - An archived project shows no switch.
- **The sidebar** (wide screens) lists the active projects. The others are in Zadaci → Projekti.
- **The weekly review** gets step 4, "Projekti": the active projects without an open task, each opening its project ("Nema sledećeg koraka").
  - Below them, "Na čekanju: N · Nekad: M" (only the statuses that have projects) with "Pregledaj ih", which opens Zadaci → Projekti.
  - The step is done when nothing lacks a next step and nothing waits.
  - Ciljevi, Navike and Oblasti move to steps 5–7. `Core.deriveWeeklyReview` returns `projects: { missingNext, onHold, someday }` (not archived, not groups of Redovne obaveze).
- **Pages:** the guide gets a "Projekti" section and the review's sentence names the new step. **Šta je novo** gets a line, and its range ends at alpha.121.

## Storage, backup and sync

- **`js/backup.js`:** a project's `status` other than `'onHold'` or `'someday'` is refused (`Invalid backup: project status`).
- **Sync:** the field travels inside the project record; nothing else changes.

## Checks

- **Node:** `tests/projects-r94.test.js`, written first; it failed 8/8. It covers:
  - the status and its normalization;
  - Kad stignem and its line;
  - the weekly review's projects and step;
  - backup and sync;
  - the project screen's switch and the next-step mark;
  - Zadaci → Projekti's folds, the rows and the sidebar;
  - Serbian and the guide;
  - the version.
- **Older tests updated (with comments):**
  - `guide-r74`: the new section;
  - `redesign-r17` and `redesign-r47a`: the harness has `Core`;
  - `redesign-r22c`: the row's meta line;
  - `redesign-r33`: Kad stignem's call;
  - `redesign-r5`: the harness has `projectTasks`;
  - R93's version pin is now "or later".
- **Chromium:** see the ledger row.
- **Manual-pending:** the phone, and sync between two devices.
