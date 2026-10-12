# Redesign R34 — cleanup after the third design pass (design)

**Date:** 2026-10-12 · **Status:** findings 19 and 38 of `docs/superpowers/specs/2026-10-12-design-pass-3.md`, which the user approved with "moze sve". · **Release:** `2.0.0-alpha.60`.

R34 changes no behavior on purpose. It removes what nothing uses and turns literal values into tokens, so that the light theme (R39) and the text size setting (R37) have one place to change.

## What changes

1. **Dead CSS** (38).
   - **Removed:** every selector whose class no runtime file (`js/*.js`, `index.html`) emits.
     - **What it covered:** the retired sidebar, the old task, goal and habit rows, the old Inbox and list tabs, the V1.3–V1.7 dashboards, the old property rows and the `v17-*` hooks.
     - **Effect:** about 1,000 selectors; the stylesheet went from 250 KB to 171 KB.
     - **Rules that also styled a live class:** only the dead selectors left them.
   - **Leftovers:** a few declarations that later rules always override are gone too, along with comments that described removed rules and the sidebar's grid columns and widths.
   - **The guard:** `tests/redesign-r34.test.js` fails when the stylesheet styles a class that nothing emits.
     - **How a class counts as live:** its name appears as a word outside comments.
     - **Built names:** a class built as `prefix-${…}` or `'prefix-' + …` counts for every class with that prefix.
2. **Dead JavaScript** (38).
   - **Removed functions:** `renderGoalRow`, `renderHabitRow` and `habitProgressLabel` (with their render routes), `navItem`, `deleteHabit`, `reorderProjects`, `toLocalDateTimeValue`, `setPlan`, `setDue` and `restoreImportedBackup`.
   - **Removed project drag:** the old sidebar's project drag branches.
   - **Removed action handlers** (nothing sends these actions any more):
     - **Old rows:** `habit-checkin`, `habit-skip`, `habit-quick-add`, `toggle-focus-task`, `open-focus` and `open-focus-task`.
     - **Old Quick Add:** `quick-due-picker` and the other old Quick Add pickers.
     - **Other:** `delete-task`, `restore-backup`, `toggle-tag`, `set-plan`, `set-due`, `set-reminder` and `calendar-new-goal`.
   - **`renderTaskRow`:** every list already asked for the compact row of R2, so the older row is gone and `renderTaskRow` always draws the compact one.
   - **Unchanged data:** the stored fields `focusTaskIds`, `isImportant` and `isUrgent` stay as they are.
   - **Translations:** the keys only the removed code used left the Serbian catalog.
3. **Colors are tokens** (38). There is no hex or `rgb()` value outside `:root`.
   - **New role tokens:**
     - **On filled controls:** `--on-accent` (white on blue and red), `--on-accent-wash` and `--on-success` (on mint).
     - **Danger:** `--danger-hover`, `--danger-line` and `--danger-ink`.
     - **Washes:** `--blue-tint` (drop targets and hovers), `--ink-wash` and `--selection`.
     - **Dimming:** `--scrim`.
     - **Shadows:** `--shadow-raised` and `--shadow-toggle`.
   - **One scrim:** windows, sheets and the "+" menu use one scrim (`--scrim`, 66 %). Before, they used 55 %, 66 % and 68 %.
   - **Drop targets:** they use the one blue tint.
4. **Font sizes are tokens** (38). Every `font-size` uses the type scale:
   - **The scale:** 9, 10, 11, 12, 12.5, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28 and 40 px.
   - **Rare sizes moved to the nearest step:** 8 → 9, 19 → 18, 21 → 20, 23 → 22 and 44 → 40.
   - **Fields:** they use `--text-input` (16 px), which a later text-size setting must not shrink, so phones do not zoom into a field.
5. **Geometry** (38).
   - **Sheet corners:** they use `--radius-sheet` (18 px).
   - **Heights:** fixed `vh` heights follow `--viewport-height`, which is `100dvh` where supported.
6. **Density only on wide screens** (19).
   - **Before:** the "Kompaktan prikaz" setting wrote its sizes inline on `<html>`, so a choice made on a computer (and synced) changed the phone too.
   - **Now:** the app sets `data-density` on `<html>`. CSS applies the comfortable or compact sizes only from 1024 px on.
   - **Phones and tablets:** they keep the compact sizes they always had. The narrow-screen `:root` values, which never took effect, were removed, so nothing moves on a phone.
   - **The Settings row:** it shows only on wide screens.

## Checks

- **Node:** `tests/redesign-r34.test.js`.
  - **Old tests updated:** tests that pinned removed rules or literal values now name tokens or check that the rule is gone. These are V1.5, V1.6, V1.7, V1.8 design, V1.9 install, M7, R1, R14, R17, R19, R20, R21, R22a, R22b, R22c, R25, R32 and R33.
  - **Version check:** R33's version check now reads "≥ 59".
- **Smoke:** `npm run smoke` passes unchanged.
- **The stylesheet before and after:** a scratch comparison resolved every token. It found only these intended differences:
  - the rounded font sizes;
  - one scrim;
  - one drop-target tint;
  - `dvh` heights;
  - `#fff` written as `#FFFFFF`.
- **Manual-pending:** visual checks on the phone and the computer.
