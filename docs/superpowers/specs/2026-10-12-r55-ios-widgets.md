# R55 — iPhone widgets and "Podeli u Dailo"

**Date:** 2026-10-12 · **Status:** the user's request (improvement 4, "moze sve"). · **Release:** `2.0.0-alpha.82`.

The Android widgets (R28, R45) and "Podeli u Dailo" (R24) come to the iPhone. The cloud session has no macOS, so nothing here is compiled or run. The Swift code is written and placed, and `docs/v2/ios-widgeti.md` walks through the Xcode steps that only Xcode can do safely.

## The App target (in the repository, compiled with the app)

- **`ios/App/App/DailoWidgetPlugin.swift`:** the iPhone side of the `DailoWidget` plugin. It is a `CAPPlugin` and `CAPBridgedPlugin` with `jsName` `DailoWidget` and two methods:
  - **`update({ snapshot })`:** stores the JSON (the same snapshot Android gets) in the App Group `group.cloud.ivapix.dailo` under `dailoWidgetSnapshot`, then reloads the widget timelines.
  - **`takeShared()`:** returns and clears what the share extension left under `dailoShared`.
  Without the App Group the calls still work, and the widgets say "Otvori Dailo".
- **`ios/App/App/DailoViewController.swift`:** a `CAPBridgeViewController` that registers the plugin in `capacitorDidLoad`, as Capacitor documents for local plugins.
- **`Main.storyboard`:** the view controller's class is now `DailoViewController` (module App).
- **`project.pbxproj`:** both files are added to the App group and its Sources phase, with new unique IDs. Nothing else in the project changes.

## The extension targets (created in Xcode by the guide)

- **`ios/DailoWidgets/DailoWidgets.swift`:** a `WidgetBundle` with "Dailo · Danas" and "Dailo · Navike", in small, medium and large sizes.
  - **What they show:** they read the snapshot from the App Group, with the title, the summary, up to five rows and the note (more, empty, or stale after midnight).
  - **Links:** the whole widget opens `dailo://today` or `dailo://habits`. A row in Navike opens `dailo://habit-done?id=…`, which checks the habit in, as on Android.
  - **Refreshing:** the timeline refreshes after midnight.
  - **Background:** on iOS 17 it uses `containerBackground`, on older versions a plain background.
- **`ios/DailoShare/ShareViewController.swift`:** a share extension. It cannot open Dailo, so it stores the shared text and link in the App Group queue `dailoShared` (at most 20) and says "Sačuvano za Dailo — Otvori Dailo da ga dodaš."

## The app (JavaScript)

- **`DailoPlatform.widget.update`** now also sends on iOS, and the app's `updateWidget` builds the snapshot for `android` and `ios`.
- **`DailoPlatform.shared.take()`** returns the queued items on iOS (an empty list elsewhere).
- **`takeSharedItems()`** runs at start and on resume. The first item opens like a link shared on Android (`dailo://share?text=…&url=…`): a link becomes an Inbox resource and text opens Quick Add. Any further items go straight to Inbox (`addToInbox`), so nothing waits behind a window.

## Why not more of it in the repository

- **The extension targets:** creating them means new build settings, Info.plists, embedding phases and code-signing for two targets in `project.pbxproj`. Writing that by hand could leave a project Xcode will not open, and it cannot be checked here.
- **App Groups:** they need a paid Apple Developer team. With a free Apple ID an entitlement in the repository would stop the build, so the capability is added in Xcode instead.

## Checks

- **Node:** `tests/ios-widgets-r55.test.js`, written first; it failed 6/6. It covers:
  - the JS hooks;
  - `takeSharedItems` with three items;
  - the plugin, the view controller, the storyboard and the `pbxproj` entries;
  - the extension sources (and that they are not in the App target);
  - balanced braces;
  - the guide;
  - the version.
- **Updated tests:** R28 (the iPhone now gets the widget snapshot; the web does not) and the M3 resume harness.
- **Manual-pending:**
  - the iOS build;
  - the Xcode steps;
  - the widgets and sharing on an iPhone.
