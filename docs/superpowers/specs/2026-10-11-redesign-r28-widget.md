# Redesign R28 — the "Danas" widget on the Android home screen (design)

**Date:** 2026-10-11 · **Status:** addition K of the second design pass, which the user approved with "moze sve". This was the last item · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.53` (Android app; iOS later).

## What it shows

"Dailo · Danas" is a resizable 4 × 2 widget.

- **Header:** "Danas" and a count ("3 u planu" or "3 planirano · 1 kasni"), with a blue "+" on the right.
- **Rows:** up to five open tasks.
  - **Order:** late tasks first (in red), then today's plan in its order.
  - **Each row:** "09:30 · Naslov" when there is a planned time.
- **The bottom line:** "+ još N" when more tasks wait, or "Ništa nije planirano za danas" on an empty day.
- **A snapshot from another day:** shows "Otvori Dailo za današnji plan" instead of yesterday's tasks.

## Taps

- **"+":** opens Quick Add (`dailo://new-task`).
- **Anywhere else:** opens Danas (`dailo://today`). Both use the link path of the icon shortcuts (R24).
- **Completing tasks:** happens in the app. The widget only reads, so no change can bypass Undo, the next repeat or sync.

## How it is fed

1. **`Core.widgetSnapshot(state, today, limit)`** is pure: the late and planned counts, the first five items (`{ title, time, overdue }`) and how many more there are. It uses the same sections as Danas.
2. **The app's `updateWidget()`** adds the Serbian texts and calls `DailoPlatform.widget.update`. It runs:
   - after each save that reaches the durable mirror;
   - at start;
   - on resume.

   Android only.
3. **The app's own plugin `DailoWidget`** (`WidgetPlugin.java`, registered in `MainActivity`) stores the snapshot in the widget's `SharedPreferences` and redraws every widget at once.
4. **`TodayWidget`** (`AppWidgetProvider`) draws from that snapshot. The system also asks it every 30 minutes, which is how a new day replaces yesterday's plan with "Otvori Dailo…".

## Files

| File | What it holds |
| --- | --- |
| `TodayWidget.java` | the widget provider |
| `WidgetPlugin.java` | the plugin that stores the snapshot |
| `res/layout/widget_today.xml` | the layout |
| `res/xml/widget_today_info.xml` | the widget's size and refresh period |
| `res/drawable/widget_background.xml` | the background |
| `strings.xml` | `widget_name`, `widget_description`, `widget_open` |
| the manifest | the `<receiver>` |

## Data

- **No change to `state`, backups or sync.**
- **The snapshot:** it holds only titles and times for today, in the widget's private `SharedPreferences`. It is rewritten after each change.

## iOS

A WidgetKit extension needs a separate Swift target and a Mac. It waits for the user's first iOS build.

## Tests (written first)

`tests/redesign-r28.test.js`:

- the snapshot: late first, the order, the time, done and future tasks left out, five and "more";
- the Serbian texts the app sends, and nothing on iOS;
- the hooks: mirror, start and resume;
- the platform plugin call (Android only);
- the Android provider, plugin registration, manifest receiver, provider info, layout ids, background and strings;
- the version `2.0.0-alpha.53`.

The debug APK builds in the cloud.

## Manual checks

On the phone:

- add the widget;
- check the rows after a change in the app;
- "+" opens Quick Add and a tap opens Danas;
- the next morning the widget says "Otvori Dailo…" until the app is opened.
