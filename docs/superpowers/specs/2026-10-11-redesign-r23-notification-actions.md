# Redesign R23 — notification buttons and haptic feedback (design)

**Date:** 2026-10-11 · **Status:** additions A and F of the second design pass, which the user approved with "moze sve" · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.48` (phone app; the web gets the vibration where a browser supports it).

## A — Buttons on phone notifications

1. **The buttons.**
   - **A task reminder:** "Završi" and "Odloži 1 sat". This covers set reminders and planned-time reminders (R18).
   - **A habit reminder:** "Zabeleži".
   - **Goal and journal notifications:** no buttons. A tap still opens them as before.
2. **Registration.**
   - **Action types:** the app registers two types once per launch, `dailo-task` and `dailo-habit` (`DailoPlatform.notifications.setActionTypes`), with Serbian titles.
   - **Scheduling:** `reconcile` gives each notification its type (`actionTypeId`).
   - **Already scheduled notifications:** the type is part of the notification's signature, so notifications scheduled before R23 are scheduled again with their buttons.
3. **Pressing a button.**
   - **What reaches the app:** the handler gets the notification's data and the button (`actionId`). A plain tap is `tap` and opens the item as before.
   - **"Završi":** completes the task through `toggleComplete`, with the next repeat, goal progress and Undo. A task that is already done stays as it is. If that task's window is open, its text is saved and the window closes first.
   - **"Odloži 1 sat":** sets the task's reminder an hour from now (to the minute) and says so ("Podsetnik je pomeren na …"). The plan is rebuilt after the save, so the phone gets the new reminder.
   - **"Zabeleži":** checks the habit in for today through `setHabitLog`. A numeric habit gets its target value.
4. **Platform notes.**
   - **iOS:** the buttons bring Dailo to the foreground (`foreground: true`).
   - **Android:** pressing a button opens Dailo, which then acts.

   Nothing runs while the app is not running.

## F — Haptic feedback

- **What:**
  - **Completing a task:** a success pulse.
  - **Checking a habit in:** a success pulse.
  - **A swipe passing the point where releasing completes the task:** a light tick.
- **How:**
  - **The phone app:** the official `@capacitor/haptics` 8.0.2, pinned exactly like the other plugins and synced into both native projects.
  - **A browser:** a short `navigator.vibrate` where it is supported; otherwise nothing.
- **When not:** the system's reduced motion setting turns it off.

## Data

Nothing changes in the data. Snoozing changes only the task's existing `reminderAt`.

## Tests (written first)

`tests/redesign-r23.test.js`:

- the action types and `actionTypeId`;
- the signature including the type;
- `actionId` in the handler;
- the Serbian titles and the kinds that get buttons;
- "Završi", "Odloži 1 sat" and "Zabeleži", the done-task guard and closing the open task window;
- haptics in the app, in a browser and with reduced motion;
- the three feedback points;
- the pinned and synced plugin;
- the version `2.0.0-alpha.48`.

`tests/native-m8.test.js` now lists Haptics.

## Manual checks

On a phone:

- the buttons appear on a task and a habit reminder;
- each button acts;
- the vibration is felt.

These are manual-pending until the user reports them.
