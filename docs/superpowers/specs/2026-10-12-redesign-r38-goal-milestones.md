# Redesign R38 — goal progress from milestones (data model)

**Date:** 2026-10-12 · **Status:** addition E of `docs/superpowers/specs/2026-10-12-design-pass-3.md`, which the user approved with "moze sve". The plan requires its own data-model note before the UI uses it. · **Release:** `2.0.0-alpha.64`.

## The change

- **The new value:** a goal's `progressMode` gains the value `milestones`, beside `manual`, `linkedTasks` and `linkedHabits`.
- **How progress is counted:** it is the share of the goal's milestones that are completed (`goal.milestones[].isCompleted`). It has no field of its own.
- **Unchanged fields:** `progressType`, `currentValue`, `targetValue` and `unit` keep what they hold. They only stop driving the shown progress while the mode is `milestones`.

## Core

- **`Core.computeGoalProgress(goal)`:** with `milestones` it returns `{ current: done, target: total, percent }`. A goal without milestones is at 0 %.
- **`Core.goalProgressFraction(goal)`:** it returns `done / total` for this mode, so `getGoalHealth` sees a goal complete when every milestone is done. With no milestones it returns 0.

## The app

- **Loading:** `normalizeState` and the app's loader keep `milestones` (any other unknown value still reads as `manual`).
- **Where it can be chosen:**
  - **The new goal window:** the progress segment reads Ručno / Zadaci / Navike / Etape. Choosing Etape opens "Više", where the milestones are added.
  - **The goal's "Izvor napretka" sheet:** it offers "Etape".
- **The goal window:**
  - **Progress:** it shows "3 od 5 etapa" and the note "Napredak se računa iz završenih etapa."
  - **No manual update:** there is no "Ažuriraj napredak".
- **Ciljevi rows:** they show "3 od 5 etapa".
- **Completing the last milestone:** it asks "Cilj je dostignut?" like any goal that reaches 100 %. `toggleMilestone` now captures and evaluates goal progress.
- **Templates:** a goal template keeps `progressMode: 'milestones'` with its milestones, and the template editor offers "Etape" as a progress source.

## Validation and compatibility

- **Backups:** `Backup.validateDomain` accepts `milestones` for a goal's `progressMode` and in goal template data. Any other value is still refused.
  - **Unchanged:** `ZIP backupVersion: 2`, schema V3 and IndexedDB v1. Nothing is migrated, and existing goals keep their mode.
  - **Older backups:** they validate unchanged.
- **Sync:** the value travels inside the goal record like any field; the server schema does not change.
- **Older versions:**
  - **Loading:** a device on `2.0.0-alpha.63` or earlier reads `milestones` as `manual`. If it then saves that goal, it writes `manual` back, and sync carries that.
  - **Backups:** importing a backup that has a milestones goal into such a device is refused by its validation, so nothing is lost silently.
  - **What to do:** update every device (the web app updates through the service worker; install the new APK on Android) before choosing "Etape" for a goal. The note stays here and in the ledger.

## Tests (written first)

`tests/redesign-r38.test.js`:

- **Core:** progress, fraction and health for the mode.
- **Data:** normalization keeps it, backups accept it and refuse other values, and templates carry it.
- **The UI:**
  - the new goal window's segment;
  - the source sheet;
  - the goal window's line and note;
  - the list row;
  - the goal-reached question on the last milestone.
