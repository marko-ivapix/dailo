# Plan — modernization and Capacitor (2026-10-09)

**Audit:** `docs/superpowers/specs/2026-10-09-modernization-capacitor-audit.md` (finding ids such as S-1, Y-2 refer to it).
**Branch:** `feature/capacitor-modernization`. **Evidence:** `docs/superpowers/progress-modernization.md`.
**Rules:** `AGENTS.md` (no framework, no silent data changes, failing test first, Search unchanged). Every phase keeps the web/PWA working. Each phase ends with the full Node suite, the syntax check and the static checks, and is committed on its own so it can be reverted alone.

Legend: **M** = required for the migration; **L** = useful, scheduled later.

## Phase M1 — tooling foundation

- **Goal:** one entry point for tests and builds, and the `www/` directory Capacitor needs, without a bundler.
- **Files:** `package.json`, `package-lock.json`, `.gitignore` (`node_modules/`, `www/`), `tools/build-www.mjs` (copies exactly `sw.js` `SHELL_FILES`, without `sw.js`), `tools/check-syntax.mjs` (the `node --check` loop, portable to macOS/Windows), `tests/tooling-m1.test.js`.
- **Data/behavior impact:** none.
- **Acceptance:** `npm test` runs the suite; `npm run build` produces `www/` with every shell file and nothing else (no docs, tests, ZIPs or service worker); `package.json` pins exact versions and `engines.node >= 22`.
- **Recovery:** delete the new files.

## Phase M2 — data and sync correctness

- **Goal:** fix existing defects that would lose or misplace data once web and app run side by side.
- **Changes:**
  - Y-1: `DailoSync` ignores unknown record types in the shadow and in the deletion pass.
  - Y-2: `Core.pruneDanglingReferences(state)` before normalizing pulled data; references to records that no longer exist are dropped (task → Inbox/no project, goal and area links removed), never thrown.
  - D-1: `Core.localDateOf(iso)` replaces every `slice(0, 10)` of an instant compared with a local date.
  - S-1: attachments open inline only as image, PDF or plain text; anything else downloads as `application/octet-stream`.
  - E-2: snapshot size counts each attachment once.
- **Files:** `js/sync.js`, `js/core.js`, `js/app.js`, `js/tasks-ui.js`, `js/cleaning-ui.js`, `js/storage.js`, tests `tests/data-m2.test.js`.
- **Data impact:** none persisted differently; pruning only removes references to records that are already gone.
- **Acceptance:** the probes from the audit pass as tests (unknown type survives an old client; dangling links sync; 00:30 Belgrade counts as today; HTML attachment is not opened inline; 1 MB attachment counted once).

## Phase M3 — platform boundary (`js/platform.js`)

- **Goal:** one module that knows web vs native; web behavior unchanged.
- **Changes:** vendored `vendor/capacitor/capacitor.js` (from `@capacitor/core` 8.5.3, with SHA-256); `DailoPlatform` with `kind`, `isNative`, `lifecycle.onPause/onResume`, `backButton.setHandler`, `files.saveFile/openFile`, `links.openExternal`, `storage.status`, `notifications.*`, `durable.*`. `app.js` uses it for:
  - P-1: no service worker in the app (and unregister a stale one);
  - P-2: backup export through `files.saveFile`; `lastExport` only after success;
  - S-1 (native): attachments through the share sheet;
  - P-4: flush pending text on `visibilitychange: hidden` (web) and `pause` (native);
  - resume: date rollover, reminders, sync;
  - P-6: knowledge links, `mailto:` and the guide open outside the app;
  - P-7: storage status "app" in the native app.
- **Files:** `js/platform.js`, `vendor/capacitor/*`, `index.html`, `sw.js` (`SHELL_FILES`), `js/app.js`, `js/settings-ui.js`, `js/knowledge.js`, `js/i18n-sr.js`, `tests/platform-m3.test.js`.
- **Acceptance:** on the web every existing test passes unchanged; with a fake Capacitor the module calls the right plugins; the service worker never registers natively; an export is recorded only on success.

## Phase M4 — Android Back and overlays

- **Goal:** Back behaves like Escape, then like a route back.
- **Changes:** `dismissTopOverlay()` extracted from the Escape chain (More sheet → Quick Add menu → popover → task-field revert → modal chain); `Platform.backButton` calls it, then `history.back()` when there is in-app history, else minimizes; a hash change no longer runs a modal's cancel side effect that signs out (P-3); `init` uses `location.replace('#today')`.
- **Acceptance:** tests for the order of dismissal, for Back during a global operation (ignored), and for the first-sync choice surviving a route change.

## Phase M5 — native durable mirror

- **Goal:** the metadata survives a cleared WebView store.
- **Changes:** after a successful save (debounced) and on pause, the native app writes the exact `todoAppData` text to `Directory.Data/dailo/state.json` (write to a temporary file, then rename). At start, if `todoAppData` is missing and the mirror exists, the mirror is put back before the normal load, which validates and migrates it. Web: no-op.
- **Acceptance:** fake-Filesystem tests for write, atomic replace, restore-when-missing, never-overwrite-existing and a corrupt mirror being ignored.

## Phase M6 — native reminders

- **Goal:** reminders arrive while the app is closed.
- **Changes:** `Core.reminderInstant` (R-2); `Core.notificationPlan(state, now, { days: 14, limit: 60, logs })` (tasks, goals, habits; never in the past; stable 31-bit ids; route data); `Platform.notifications.reconcile(plan)` (cancels stale, schedules missing, keeps the rest; never cancels everything first); reconcile after saves (debounced), on start, resume, day change and sync apply; taps open the task, goal or habit (listener registered before the first render); native permission from Settings; on the native app the in-app checker only records fired moments (no duplicate toast). H-2: snooze boundaries.
- **Acceptance:** pure plan tests (windows, limits, weekly-target silence, snoozes, completed/deleted items), reconcile tests with a fake plugin, tap routing test.

## Phase M7 — mobile quality

- **Goal:** usable on phones inside the app and as a PWA.
- **Changes:** popovers close on width changes only (P-5); `100dvh` with a `100vh` fallback for modals; 16 px form fields on coarse pointers (no iOS zoom); the touch-target guard also under `(pointer: coarse)` (A-1); toast above the bottom navigation and the safe area; the six unnamed icon buttons get names; CSP meta (S-2).
- **Acceptance:** CSS/markup contract tests; the existing design and offline tests still pass.

## Phase M8 — Capacitor shell

- **Goal:** versioned iOS and Android projects for `cloud.ivapix.dailo`.
- **Changes:** npm dependencies (Capacitor 8.5.3 and the four plugins, exact versions); `capacitor.config.json` (`webDir: www`, dark background, `ios.contentInset: never`, SystemBars CSS insets, Keyboard resize, notification icon); `npx cap add ios` (Swift Package Manager) and `npx cap add android`; app icons, splash and the notification icon restored from `d41d203`; Android `SCHEDULE_EXACT_ALARM` (with the inexact fallback); `npx cap sync`.
- **Acceptance:** static tests on the config, the manifest permissions, the app id and the absence of a `server.url`; `npx cap sync` succeeds. Native compilation is **[NV] here** (no Android SDK, no macOS) and is the user's first manual check.

## Phase M9 — moving data into the app

- **Goal:** a clear first-run path from the PWA.
- **Changes:** a one-time native notice "Imaš podatke u web verziji?" with "Uvezi ZIP" and, when sync is configured, "Prijavi se"; a fresh install whose data is still the untouched sample takes the account's data on first sync instead of merging the samples.
- **Acceptance:** tests for the notice conditions and the first-sync mode.

## Phase M10 — release and documentation

- `APP_VERSION` and `sw.js` `VERSION` → `2.0.0-alpha.2`; the newest test pins it.
- Docs: `CLAUDE.md`, `README.md`, `docs/claude/*` (map, architecture, data, testing), a Serbian guide for building on the Mac (`docs/v2/capacitor-mac.md`), the progress ledger with every check that ran and every check that could not.

## Later (L), not in this round

- T-1 test loader helper, then splitting `app.js` (state model, router/overlay stack, lifecycle/undo, sync and reminders controllers, views), together with the redesign.
- TypeScript `checkJs` on Core/Sync/Storage/Platform with JSDoc; a small ESLint rule set; dead-code removal.
- S-3 tokens in Keychain/Keystore; S-4 color validation; E-1 export limits; R-3 device-local fired state; deterministic ids for recurring and scheduled tasks; Q-1 render/save performance; A-2 focus management; metadata out of localStorage (needed before the journal grows); JSZip 3.10.2; icon-font trimming.
- Needs a user decision: H-1 habit history semantics, daily-habit reminders after check-in, Search debounce/cap.

## Test levels

| Level | Where | Who |
| --- | --- | --- |
| Node unit/contract tests | `tests/*.test.js` | every phase, here |
| Build (`www/`, `cap sync`) | `npm run build`, `npx cap sync` | here (sync), Mac for iOS |
| Native compile | Xcode, Android Studio / Gradle | user's Mac (blocked here: no Android SDK, no macOS) |
| Emulator / simulator | iOS Simulator, Android Emulator | user |
| Physical devices | iPhone, Android phone | user; first flow: create a task, close the app, reopen it, the task is there |
