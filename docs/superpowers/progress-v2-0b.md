# Dailo V2.0-b Progress Ledger — Capacitor shell

**Baseline:** V2.0-a (`2.0.0-alpha.1`, `73fd942`) on `ccr-95f6062b-lgg2fr`
**Spec:** `docs/superpowers/specs/2026-10-08-todo-v2-0-design.md`, section A and phase 2 (approved 2026-10-08)
**Plan:** `docs/superpowers/plans/2026-10-08-todo-v2-0b.md`

## Status

- [x] Step 1 — Packaging (`51c098f`)
- [x] Step 2 — Native bridge (`2bfc2d0`)
- [x] Step 3 — Assets, native settings, build guide, release `2.0.0-alpha.2`
- [ ] User: build and run on iPhone and Android per `docs/v2/izrada-aplikacije.md` (manual-pending)
- [ ] Manual: reminders while the app is closed, notification taps, share-sheet export, ZIP import, layout under the status bar and the home indicator, Android back button (B37–B42, manual-pending)

## Evidence

**Step 1 — packaging.** `tests/native-v2-0b.test.js` was written first; all 5 tests failed before the change.
- **`package.json`:** `private`, no `"type"`, exact versions.
  - `@capacitor/core`, `ios`, `android` and `cli` 8.5.3; `local-notifications` 8.3.1, `app` 8.1.2, `filesystem` 8.1.4, `share` 8.0.3.
  - Scripts `build` (`node tools/build-www.mjs`), `sync` (build, then `cap sync`) and `test`.
  - `package-lock.json` is committed.
  - `npm audit --omit=dev` finds no vulnerability. The three moderate findings are in the developer tool `@capacitor/cli` (`xcode` → `uuid`), which is not shipped in the app.
- **`capacitor.config.json`:** `cloud.ivapix.dailo`, "Dailo", `webDir` `www`, background `#0F1114`, iOS `contentInset: never`.
  - Android `SystemBars`: `insetsHandling: css`, `initialViewportFitValueHint: cover`, style `DARK` (light icons on the dark app).
  - Local Notifications: small icon `ic_stat_dailo` and color `#0619FE`.
- **`tools/build-www.mjs`:** copies exactly `SHELL_FILES` from `sw.js` into `www/` (or a given directory) after emptying it. It does not copy `sw.js`; the test compares the file list and the bytes.
- **`vendor/capacitor/capacitor.js`:** the unchanged `@capacitor/core` 8.5.3 runtime (MIT `LICENSE`, SHA-256 in `capacitor.js.sha256`).
  - It loads first in `index.html` and is precached.
  - On the web it only reports the platform `web`. In the app it provides `Capacitor.registerPlugin`, which a no-bundler build needs to reach native plugins.
- **Native projects,** generated with `npx cap add`:
  - `ios/`: Swift Package Manager, iOS 15, `CapApp-SPM` with the four plugins;
  - `android/`: minimum API 24, compile and target API 36.
  - Copied web files and generated config files stay ignored by the templates' `.gitignore`.
  - `.gitattributes` keeps the template formatting (for example the CRLF `gradlew.bat`) out of `git diff --check`.
  - `npm run sync` leaves the committed native files unchanged.

**Step 2 — native bridge.**
- **`Core.upcomingReminders(state, now, { days = 14, limit = 60, logs })`** (pure) lists the next reminder moments, sorted by time with unique keys:
  - **tasks:** open tasks' `reminderAt`;
  - **goals:** active goals' reminder moments;
  - **habits:** enabled habit times on scheduled days;
  - **snoozes:** a pending snooze is included, and a snooze silences the earlier moments;
  - **weekly targets:** a met target silences the rest of the current week;
  - fired, past, far, paused, archived and disabled items are skipped.
- **`js/native.js` (`DailoNative`):**
  - `notificationId` is a stable positive 31-bit FNV-1a hash of the key;
  - `toNotifications` builds the title, the translated body per kind, `schedule.at` with `allowWhileIdle`, and `extra.route` (`#today`, `#goals`, `#habits`);
  - `createBridge` is inert on the web.
  - In the app, `scheduleReminders` does nothing without permission. Otherwise it cancels the pending set and schedules the new one, and skips an unchanged set.
  - `shareFile` writes the file to the cache (base64) and opens the share sheet. It returns false when the sheet is cancelled; other failures throw.
  - `onResume` and `onNotificationTap` report app events.
- **`app.js`:**
  - **App mode:** `Native` is created at load. In the app: no service worker, persistence state `native`, `environmentInfo().standalone` true, the guide opens online.
  - **Reminders:** `scheduleNativeReminders()` runs 2 s after every successful save (never during recovery, a global operation or start-up), and at once on start and on resume. Resume also runs `checkReminders` and `scheduleSync(500)`.
  - **Taps:** a tapped notification opens its route; only `#route` values are accepted.
  - **Permission:** the Settings notification button uses native permission (already on, turned off in the phone settings, granted, or not granted), and its label follows the permission.
  - **Backups:** `downloadBackup` uses the share sheet (true, false or null). Export counts only when shared, and a cancelled share says so.
- **`settings-ui.js`:** in the app, "Podsetnici" with "stižu … i kad je Dailo zatvoren", the storage text "Aplikacija čuva podatke u sopstvenom prostoru …" without a Request button, and `ctx.guideUrl`.
- **Catalog and stubs:**
  - catalog +8 (1510 entries);
  - a `Native` stub in `tests/data-protection-v1-9.test.js`, `startNative` in `tests/final-integration-v1-5.test.js` and `scheduleNativeReminders` in `tests/tasks-today-v1-5.test.js`;
  - the V2.0-a wiring regex no longer requires `return true` right after `scheduleSync()`.

**Step 3 — assets, native settings, guide, release.**
- **`tools/generate-icons.py --native`** draws from the same brand mark:
  - the iOS 1024 px App Store icon (RGB, no alpha);
  - three 2732 px iOS launch images (a rounded blue tile on `#0F1114`);
  - Android legacy, round (transparent corners) and adaptive-foreground launcher icons (the mark inside the 66/108 safe zone; background color `#0619FE`);
  - portrait and landscape launch images;
  - the white `ic_stat_dailo` notification silhouette at 24 dp × five densities.
  - `tests/support/png.js` decodes the PNGs in the tests to check sizes, alpha and colors.
- **iOS `Info.plist`:** `UIUserInterfaceStyle` Dark, `CFBundleAllowMixedLocalizations`, `ITSAppUsesNonExemptEncryption` false; `MARKETING_VERSION` 2.0.0 (Debug and Release).
- **Android:** `versionName` "2.0.0", `versionCode` 1; the launch theme gets `windowSplashScreenBackground` `#0F1114`.
- **Guide:** `docs/v2/izrada-aplikacije.md` (Serbian) covers the tools, `npm ci` and `npm run sync`, Xcode signing with a free Apple ID, Developer Mode, Android USB debugging, a first check of reminders and export, moving data, and updating.
- **Version:**
  - `APP_VERSION` and `sw.js` `VERSION` are `2.0.0-alpha.2`, pinned only in `tests/native-v2-0b.test.js`;
  - the V2.0-a release test now requires a V2 version;
  - the precache list has 43 files (`vendor/capacitor/capacitor.js`, `js/native.js`).

Checks (Node v22.22.0, Python 3.13.16):
- full Node suite: **413 tests, 413 passed, 0 failed, 0 todo**, in 49 `tests/*.test.js` files (393 at V2.0-a; +20 in `tests/native-v2-0b.test.js`);
- JavaScript syntax **78/78**, plus `tools/build-www.mjs`;
- Python AST 19/19;
- static browser contracts 10/10; registry 3/3; path adapter 2/2;
- `git diff --check` passed.

Nothing here was built with Xcode or Gradle, and nothing ran on a phone. The builds, signing, notifications, sharing, file import and native layout are **manual-pending** until the user runs `docs/v2/izrada-aplikacije.md`.
