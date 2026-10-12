# Redesign R45 — the Android "Navike" widget

**Date:** 2026-10-12 · **Status:** point 3 of the next-steps list ("moze 1 i 3"). · **Release:** `2.0.0-alpha.71`.

## The widget

- **The widget:** a second home-screen widget, "Dailo · Navike", 3 × 2 cells by default and resizable.
- **What it shows:**
  - **The heading:** "Navike" with "N od M danas", counted like the header of Navike.
  - **The habits:** up to five of today's planned habits.
    - **Order:** open ones first in routine order (Jutro, Dan, Veče), then the done ones.
    - **Marks:** an open habit shows "○", a done one "✓" in green. A numeric habit adds its value and target ("· 0,5/2 l").
  - **The note:** "+ N više", or "Danas nema planiranih navika".
  - **A snapshot from another day:** it is never shown as today's; the widget says "Otvori Dailo za današnje navike" instead.
- **Taps:**
  - **An open habit:** it opens Dailo with `dailo://habit-done?id=…`, which checks the habit in for today.
    - **A checkbox habit:** it gets Undo ("Navika je zabeležena").
    - **A numeric habit:** it opens its value sheet.
    - **A habit already done:** "Već zabeleženo danas: …".
  - **Anything else:** it opens Navike (`dailo://habits`).
  - **Opening Dailo:** a widget cannot run app code without opening it, so the check-in happens in Dailo.

## How it is fed

- **Core:** `Core.habitsWidgetSnapshot(habits, logsByHabit, today, weekRule)` returns `{ date, done, planned, items, more }`, with the planned habits as `Core.habitDayPercent` counts them.
- **The app:** `updateWidget` adds a `habits` part (`habitsWidgetPart`), with ready-made Serbian rows, to the R28 snapshot.
  - **When it refreshes:** after every save, and now also after each check-in (`setHabitLog`).
- **The plugin:** `WidgetPlugin` refreshes both widgets.
- **The native code:** `HabitsWidget.java`, `res/layout/widget_habits.xml`, `res/xml/widget_habits_info.xml`, the strings and the manifest receiver.
- **The app's links:** `handleIncomingLink` accepts `habits` and `habit-done`; `checkInHabitFromLink` does the check-in.

## Checks

- **Node:** `tests/redesign-r45.test.js`, written first; it failed 6/6.
  - **What it covers:** the snapshot (order, counts, skipped and unscheduled days, the limit), the app's `habits` part, the link check-in with Undo, the numeric case and the "already done" case, the native files and the Serbian strings.
  - **Old tests updated:** R28 now expects the `habits` part, and R8c the refresh after a check-in.
- **Build:** `./gradlew assembleDebug` built `2.0.0-alpha.71` in the cloud.
- **Manual-pending:** adding the widget on a phone, and tapping a habit in it.
