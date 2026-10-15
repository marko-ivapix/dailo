# R79 — "Sutra" on a task notification

**Date:** 2026-10-15 · **Status:** point 5 of the outside review ("Dugmići u obaveštenju (Završi / Odloži / Sutra)…"), accepted by the user ("Sve se slažem…"). The source had Završi and Odloži 1 sat, but no Sutra. · **Release:** `2.0.0-alpha.106`. No data-model change.

## The change

- **The button.** `notificationActionTypes` gives `dailo-task` a third button, `tomorrow` ("Sutra"), after Završi and Odloži 1 sat.
  - Like the others, it brings Dailo to the front.
  - The phone registers the buttons at launch, so the new button shows after Dailo is opened once.
- **What it does** (`planTaskForTomorrowFromNotification`):
  - **The plan:** the task is planned for tomorrow, the way the plan picker's "Sutra" plans it. It leaves Inbox and has no Today order.
  - **The reminder:** a task with its own reminder gets it at the same local time tomorrow. A planned-time reminder follows the day by itself. Moving the reminder later lets it fire again, by the R-3 rule.
  - **Undo:** "Zadatak je premešten za sutra" with Undo, which restores the day, the Inbox marker, the order and the reminder.
  - **A repeating task** asks "this or future" through `moveTaskToTomorrow`, as the swipe does.
  - **A completed task** is left alone.
  - **The task's open window** is saved and closed first, as for Završi.

## Checks

- **Node:** `tests/notification-tomorrow-r79.test.js`, written first; it failed 5/5. It covers:
  - the buttons and the Serbian title;
  - the plan, the reminder and Undo;
  - a planned-time reminder, a completed task and a repeating task;
  - the open window;
  - the version.
- **Older tests updated (with comments):**
  - `tests/redesign-r23.test.js`: the task's first two buttons, then more;
  - `tests/restore-journal-r78.test.js`: the version is now "or later".
- **Manual-pending:** the button on an Android and an iPhone notification (Android shows three buttons, and iPhone shows them when the notification is opened).
