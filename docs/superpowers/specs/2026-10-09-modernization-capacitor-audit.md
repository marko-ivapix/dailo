# Dailo — technical audit, modernization and Capacitor readiness

**Date:** 2026-10-09. **Branch:** `feature/capacitor-modernization` (from `ccr-95f6062b-lgg2fr` at `340c49f`, which carries V2.0-a sync and the final redesign decision log).
**Scope:** an audit of the real code, a technology and architecture assessment, and a phased plan to ship the same app as a PWA and as Capacitor apps for iOS and Android. The phases are in `docs/superpowers/plans/2026-10-09-modernization-capacitor.md`; their evidence is in `docs/superpowers/progress-modernization.md`.
**Inputs:** `AGENTS.md`, `CLAUDE.md`, `docs/claude/*`, the V2.0 spec, the redesign decision log, every file in `js/`, `sw.js`, `index.html`, `css/styles.css`, the tests, the reverted V2.0-b commits (`51c098f`, `2bfc2d0`, `d41d203`), the npm registry and the Capacitor package sources.

Labels: **[C]** confirmed in code or by a probe; **[A]** assumption from platform knowledge; **[NV]** not verifiable in this environment. Line numbers refer to `340c49f`.

## 1. Summary of the real state

- **Stack [C].** Static HTML, CSS and vanilla JavaScript; 23 classic scripts sharing globals (`window.TodoCore`, `TodoStorage`, …) plus vendored JSZip 3.10.1, fonts and Phosphor icons; no framework, no bundler, no `package.json`, no lockfile, no CI. `AGENTS.md` forbids a framework migration without explicit approval.
- **Size [C].** `js/` 12,574 lines and 1.06 MB; `js/app.js` alone is 4,748 lines and 335 KB (344 functions, 41 top-level `let` globals). `css/styles.css` 2,264 lines (172 KB). The page loads about 1.76 MB uncompressed (JS ≈256 KB gzip).
- **Data [C].** Metadata schema V3 as one JSON string in `localStorage.todoAppData`; IndexedDB `todoAppDB` v1 (`attachments`, `habitLogs`, `goalHistory`, `recoverySnapshots`); sync metadata and tokens in `localStorage.dailoSync`; ZIP backup format 2.
- **Sync [C].** Optional Supabase (e-mail one-time code), off until `js/sync-config.js` is filled; last-write-wins per record; attachments and goal history do not sync.
- **PWA [C].** Manifest, versioned service worker (`sw.js`, cache `dailo-shell-<APP_VERSION>`), offline shell.
- **Platform features [C].** Attachments (Blobs in IndexedDB), in-app reminders (toast plus the `Notification` API, only while the page is open), a 30-second timer for date rollover, scheduled templates and reminders, a focus timer, file import through `<input type=file>`, export through `<a download>`.
- **Quality gates [C].** Node 393/393 tests (48 files), JavaScript syntax 75/75, Python AST 22/22, static browser contracts and registry pass. The Playwright scenarios are English-text based and out of date for the Serbian UI (documented). There is no lint or type check.
- **Capacitor [C].** None in the tree. A Capacitor 8.5.3 shell was built on 2026-10-08 and reverted the same day at the user's request; its native projects, icons and parts of its bridge are reusable (section 7).
- **Environment limits [C].** Node 22.22, Java 21 and Gradle 8.14.3 are present, but the network policy denies `dl.google.com`, `maven.google.com` and `capacitorjs.com`, so no Android SDK and no Android Gradle Plugin can be fetched: a native Android build cannot run here. There is no macOS, so no iOS build. Native behavior is therefore **[NV]** in this audit.

## 2. Baseline checks (run 2026-10-09 on `340c49f`)

| Check | Result |
| --- | --- |
| `node --test tests/*.test.js` | 393 tests, 393 passed, 0 failed (≈2.1 s) |
| `node --check` on `js/*.js vendor/*.js tests/*.js tests/support/*.js sw.js` | 75/75 |
| Python AST (`tests/**/*.py`, `tools/*.py`) | 22/22 |
| `tests/test_browser_path_adapter.py` | OK |
| Browser regression registry | 3/3 |
| `tests/run-browser-regressions.py --dry-run` | static groups pass (2 + 3 + 5 checks) |
| ESLint 10.12 (recommended rules, trial config outside the repo) | 0 real errors; 32 `no-dupe-keys` from the intentional "defaults, spread, override" pattern in `normalizeState` (app.js:353–661), 35 unused variables (dead code, section 4.4), 8 `preserve-caught-error`, 6 `no-empty` |
| TypeScript 7.0.2 `--checkJs --noEmit` (non-strict, trial outside the repo) | 88 errors across `js/`, all inference noise (option objects with defaults, `new Promise` without JSDoc, globals); 3 in `core.js`, 3 in `storage.js`, 12 in `sync.js`, 46 in `app.js` |

Performance baseline (jsdom on Node, in-memory database; use for scaling, not device times) [C]:

| Measure | Empty | 1,000 tasks | 3,000 tasks |
| --- | --- | --- | --- |
| `todoAppData` JSON | 7.6 KB | 608 KB | 1.8 MB |
| Boot | 150–390 ms | 321 ms | 1,069 ms |
| `render()` Today | 21 ms | 115 ms | 330 ms |
| `render()` Anytime | 14 ms | 243 ms | 799 ms |
| Save path | – | 51 ms | 117 ms |
| One "complete task" tap | – | 179 ms | 641 ms |
| One Search keystroke | – | 171–226 ms | 465–733 ms |

## 3. Existing problems versus migration risks

**Existing defects (present today on the web, independent of Capacitor):** S-1 attachment origin, D-1 UTC day slicing, Y-1 unknown sync types deleted, Y-2 sync stuck on dangling links, L-3 hash change runs modal cancel side effects (signs out of the first-sync choice), the export-size gap, the snapshot size double count, dead code.

**Problems the migration would introduce if nothing changed:** the service worker registering inside the Android app, silent no-op exports and attachment opens in WebViews, no Android Back handling, no pause flush (iOS kills apps in the background without `pagehide`), external links navigating the WebView, `Notification` absent in WebViews, a misleading "persistence denied" status, the guide page missing from `www/`, data stranded in the Safari origin.

## 4. Prioritized findings with evidence

### 4.1 High

| ID | Where [C] | Problem | Consequence | Fix | Needed for migration |
| --- | --- | --- | --- | --- | --- |
| S-1 | app.js:1867–1874 (`openAttachment`), types from app.js:1808 and backup.js:433 | An attachment opens as a `blob:` URL in the app origin with its own MIME type | An `.html`/`.svg` attachment (or one inside a crafted backup) runs script with access to localStorage (sync tokens) and IndexedDB | Open inline only images, PDF and plain text; force a download (`application/octet-stream`) otherwise; native: write to cache and hand to the share sheet | Yes (security) |
| Y-1 | sync.js:81–87, 122, 287–291 | Rows of a type the client does not know are added to the shadow, then pushed as deletions | An older web build next to a newer app deletes the newer types on the server (probe: `journal/j1` became `deleted: true`) | Ignore unknown types in the shadow and in the deletion pass | Yes (mixed versions are certain once the app ships) |
| Y-2 | app.js:3473 → core.js:1571–1574 | `normalizeState` throws on a task whose project, goal or area was deleted on another device | Sync stops for good on both devices (probe: `missing-task-project`, `missing-task-goal`, `missing-task-area`) | Prune dangling references when applying remote data | Yes if sync is a transfer path |
| D-1 | core.js:216; app.js:1101, 1261, 1906; tasks-ui.js:22; cleaning-ui.js:23; core.js:901, 909 | UTC instants are cut to `YYYY-MM-DD` and compared with the local day | In Serbia, work completed 00:00–01:59 (summer) lands on the previous day: missing from "completed today", wrong Completed grouping and goal-history day (probe at 00:30 on 2026-10-09 → `2026-10-08`) | One `Core.localDateOf(iso)` helper at every site | No, but cheap and user-visible |
| P-1 | app.js:3636–3648 | `registerServiceWorker` accepts any `https:` or `localhost` origin | Android serves `https://localhost`, so the worker registers; after a store update the cached shell can keep running old JS | Skip (and unregister) inside the native app | Yes |
| P-2 | app.js:3721–3726, 3674–3675, 3860, 3877 | Export uses `<a download>` on a blob URL and records "export verified" right after `click()` | In a WebView nothing is saved [A] while the app records a backup and says a safety ZIP was downloaded | `Platform.files.saveFile` (Filesystem + share sheet natively); record `lastExport` only on success | Yes |
| P-3 | app.js:4655, 1500, 3563; app.js:4734 | No Back handling; every hash change closes the modal through its `onCancel`; `init` adds a history entry | Android Back changes the route and runs cancel side effects (the first-sync choice signs out); an extra Back step | `dismissTopOverlay()` shared with Escape; Back = overlay, then route back, then minimize; `location.replace` in `init`; a route change does not sign out | Yes |
| P-4 | app.js:4669, 3587; knowledge.js:98–99 | Pending text is flushed only on `pagehide`; drafts live in memory | iOS suspends and may kill a backgrounded app without `pagehide` [A]: the last edits are lost | Flush on `visibilitychange: hidden` and on the native `pause` | Yes (and helps the iPhone PWA) |
| T-1 | 24 test files, e.g. recovery-v1-6:17,36; sync-app-v2-0a:365 | Tests slice `app.js` by function text | Moving functions out of `app.js` breaks the suite | A loader helper before any large move | Before refactoring app.js |

### 4.2 Medium

| ID | Where [C] | Problem → consequence | Fix | When |
| --- | --- | --- | --- | --- |
| R-1 | app.js:3998–4041, 4735 | Reminders fire only while the page is open | Native local notifications from a pure plan (14 days, ≤ 60 for iOS's 64-pending limit [A]), reconciled on save, resume and day change | Migration |
| R-2 | core.js:1338 vs app.js:218, core.js:437 | `reminderAt` is stored as floating local time or as UTC | One `Core.reminderInstant(value)`; no data rewrite | Migration |
| R-3 | app.js:4030, core.js:1134, synced records | Fired markers live on synced records and bump `updatedAt` | A reminder firing on one device can overwrite an edit on another (LWW) [A] | Later: device-local fired state |
| P-5 | app.js:4670 with 2184–2213; css 422/1313/1386/2190; 14px inputs | `resize` closes popovers that contain text inputs; `100vh` modals; iOS zooms into 14px fields | Close only on width change; `100dvh`; 16px fields on touch | Migration (mobile quality) |
| P-6 | knowledge.js:61; settings-ui.js:102–103 | `target=_blank`, `mailto:` and the relative guide link | In the app they can navigate the WebView or point at a file that is not packaged | `Platform.links.openExternal`; the guide opens online | Migration |
| P-7 | app.js:3622–3633 | Persistent-storage request in a WebView | Reports "denied/unsupported" and misleads | Native status "app storage" | Migration |
| S-2 | index.html:3–19 | No Content Security Policy | No second line of defense against injected markup | CSP meta (`script-src 'self'`, `object-src 'none'`, `connect-src 'self' https://*.supabase.co`, …) | Before store release |
| S-3 | app.js:3401–3413, sync.js:167–172 | Access and refresh tokens in plain localStorage | Readable by any script in the origin | Keychain/Keystore through a vetted plugin | Before public sync |
| S-4 | core.js:144 and 16 `style="--x-color:…"` sites | Imported or synced colors are not validated | CSS injection (beacons, overlays) | Accept `#rrggbb` only | Later (cheap) |
| E-1 | backup.js:61–94 vs 16–21 | Export enforces none of the import limits (200 attachments, 50 MB) | A large backup cannot be imported, so it cannot move data | Check at export, align limits | Later, before large data |
| E-2 | storage.js:617–650 | Snapshot size counts shared attachment refs twice | Permanent "automatic snapshot failed" once attachments reach ~12 MB; blocks the first-sync choice | Count once | Later (cheap) |
| Q-1 | app.js:833–956, 538–560; storage.js:797–804 | Full re-render and two normalizations plus a full JSON write per action | 179 ms per tap at 1,000 tasks in jsdom, slower on phones [A] | Normalize once, cap long lists, single-row updates | Later |
| A-1 | styles.css:1385, 1173, 1773, 564, 1699, 2254 | Touch targets below 44 px; the guard applies only at `max-width:700px` | Missed taps on phones and tablets | Apply under `(pointer: coarse)` | Migration (mobile quality) |
| A-2 | app.js:2406, 2419, 4655 | Focus falls to `BODY` after re-render; routes do not move focus or set `document.title` | Screen-reader users lose their place | Restore focus by selector; focus `h1` on route change | Later |
| H-1 | core.js:1050, 1061, 1065; habits-ui.js:564 | A weekly target or week-start change rewrites history; first and paused weeks are not prorated; un-checking a daily habit zeroes the streak | Surprising statistics | Needs a product decision (section 10) | Later |
| H-2 | app.js:3308, 2018 | "Tonight" snooze after 21:00 is in the past; "later today" can cross midnight | Immediate re-fire | Correct the boundaries | Before native snooze |

### 4.3 Low

- Orphan attachment Blobs after a crash between the Blob write and the metadata save are never removed (storage.js:315–321).
- The recovery screen offers no restore from snapshot or ZIP (app.js:1281–1287, 3846).
- Undo of a task deletion does not restore its Daily focus slot (app.js:542; core.js:752–756).
- `recoverySnapshots.listAll()` runs one second after every save although copies are taken at most every five minutes (storage.js:659).
- First sync from a fresh install merges the sample tasks into the account (app.js:465–475, sync.js:237–240).
- Recurring successors and scheduled template tasks get random ids per device; with sync they can duplicate [A] (app.js:175, 1654, 2278).
- Search has no debounce or cap (app.js:4318–4320, 1888–1894); changing it needs approval (compatibility rule).
- Six icon-only buttons have no accessible name (goals-ui.js:118, 256, 261; habits-ui.js:322, 333; projects-ui.js:47).
- `--ink-4` contrast 2.8–3.9:1 for 11 px hour labels; toasts are announced twice (`#toast` and `#global-status`).
- Dead code: `openAreaLinkedModal` and its unreachable `area-linked` path (app.js:1444, 1522, 1918, 3092, 4167), `deleteHabit` (3301), duplicate `openGoalModal`/`openHabitModal` keys in `domainContext` (661), unused locals.
- No `unhandledrejection` handler; `exportBackupAction` and duplicate-with-files have no double-submit guard.

### 4.4 Architecture and code quality

- **app.js is the composition root and most of the controller [C]:** state model and defaults (230–414), load/save (415–585), routing (710–760), every daily screen, Quick Add, attachments UI, Search, task edits and recurrence (2202–2400), the delete/Undo lifecycle (2400–3008), domain controllers (3009–3400), sync controller (3400–3593), backup/restore (3667–3984), reminders (3985–4043) and event delegation (4062–4637).
- **Adapters** (`*-ui.js`) receive a fresh ~130-member `domainContext()` per hook (617–700) and own their rendering; business rules still sit in `app.js`.
- **Two state normalizers:** `Core.normalizeState` (imports) and the app's `normalizeState` (UI defaults, sync). Goal links are written in seven places. Two id generators (`uid` with `Math.random`, `Core.makeUuid` with crypto).
- **Good foundations to keep [C]:** pure, Node-tested Core rules; careful cross-tab and IndexedDB guards (canonical compare-and-set, habit-log rollback); strong import validation and global-operation recovery; consistent escaping (`esc` at every sink, verified across 27 `innerHTML` sites); no inline handlers, no `eval`; vendored assets, no CDN; listeners attached once, no leaks found.

## 5. Keep / improve / replace / remove

| Item | Decision | Reason |
| --- | --- | --- |
| Vanilla JS, classic scripts, no framework | **Keep** | Works, tested, and `AGENTS.md` requires approval for a framework. A framework would not fix any finding above; the redesign can be built on the same pattern as the prototypes. |
| No bundler (no Vite) | **Keep** | Nothing to bundle or transpile; a copy step (`tools/build-www.mjs`) gives Capacitor its `webDir`. Vite would change script loading and break 26 `vm`-based tests for no concrete gain now. Revisit only if the code moves to ES modules. |
| ES modules | **Keep classic scripts (for now)** | 26 test files evaluate scripts in `vm` contexts and 24 slice `app.js`; converting is a large, risk-only change at this point. |
| `localStorage` metadata + IndexedDB | **Keep, add a native durable mirror** | Proven migration/recovery code; the risk in WebViews is eviction under storage pressure [A] and the ~5 MB localStorage limit [A]. A file mirror in the app's data directory restores the metadata if the WebView store is cleared. Moving metadata to IndexedDB or SQLite is a later step, required before large notes or the journal grow past a few MB. |
| SQLite (`@capacitor-community/sqlite` 8.1.1) | **Not now** | Would need a second persistence layer for web, a data migration and a new test harness; no query need exists today. |
| Capacitor Preferences | **Use only for small native flags** (if needed) | Not encrypted; not for state or tokens. |
| Tokens in localStorage | **Replace later** (Keychain/Keystore) | Section 4.2 S-3. |
| `<a download>`, `window.open(blob)`, `Notification` | **Replace behind `DailoPlatform`** | Do not work in WebViews [A]. |
| Service worker | **Keep for web, skip natively** | P-1. |
| JSZip 3.10.1 (vendored) | **Keep; update to 3.10.2 later** | 3.10.2 was published 2026-09-08; no known defect blocks us. |
| Phosphor fill font (217 KB for 2 icons) | **Improve later** | Payload only. |
| TypeScript | **Add later as `checkJs` on pure modules** | 88 noise errors without JSDoc; real value is in Core/Sync/Storage once annotated. Not a migration prerequisite. |
| ESLint | **Add later with a small rule set** | Today it mostly reports an intentional pattern and dead code. |
| `package.json` + lockfile | **Add now** | Capacitor needs npm dependencies; scripts give one entry point for tests and builds. |
| Dead code (section 4.3) | **Remove** (later, with tests) | No behavior. |
| Release ZIPs committed in the root | **Keep for now** | Small (≈2.4 MB in total); excluded from `www/`. |

## 6. Recommended stack and verified versions

Checked on 2026-10-09 against the npm registry (`npm view`), the package contents (`npm pack`) and the published guides listed below. `capacitorjs.com` could not be fetched from this environment (network policy), so its pages are cited from search results.

| Component | Version | Evidence |
| --- | --- | --- |
| `@capacitor/core`, `cli`, `ios`, `android` | **8.5.3** (2026-10-07; 8.0.0 was 2025-12-08) | npm registry; `@capacitor/cli` `engines.node` `>=22.0.0` |
| `@capacitor/app` | 8.1.2 | npm; peer `@capacitor/core >=8.0.0` |
| `@capacitor/filesystem` | 8.1.4 | npm |
| `@capacitor/share` | 8.0.3 | npm |
| `@capacitor/local-notifications` | 8.3.1 | npm; README: Android 13 runtime permission, Android 12+ `SCHEDULE_EXACT_ALARM` for exact times, falls back to inexact |
| `@capacitor/keyboard` | 8.0.6 | npm; `resize` (iOS) and `resizeOnFullScreen` (Android) |
| Node.js | 22 LTS (22.22 here) | CLI `engines` |
| Xcode | 26 or newer | Capacitor 8 environment setup and upgrade guides; App Store uploads require Xcode 26 since 2026-04-28 |
| iOS deployment target | 15.0 | `Capacitor.podspec` `ios.deployment_target` |
| iOS dependency manager | Swift Package Manager (default for new projects) | `ios-spm-template` in `@capacitor/cli` 8.5.3 |
| Android Studio | Otter 2025.2.1 or newer | Capacitor 8 upgrade guide |
| JDK | 21 | `capacitor-android` `build.gradle` `JavaVersion.VERSION_21` |
| Android Gradle Plugin / Gradle | 8.13.0 / 8.14.3 | `capacitor-android` `build.gradle`; CLI template `gradle-wrapper.properties` |
| Android SDK | minSdk 24, compile/target 36 | CLI template `variables.gradle` |
| Not adopted now | TypeScript 7.0.2, ESLint 10.12.0, `@capacitor-community/sqlite` 8.1.1, `@capacitor/preferences` 8.0.1 | npm; reasons in section 5 |

Sources: [Capacitor environment setup](https://capacitorjs.com/docs/next/getting-started/environment-setup), [Updating plugins to 8.0](https://capacitorjs.com/docs/updating/plugins/8-0), [Capawesome: upgrade to Capacitor 8](https://capawesome.io/blog/how-to-upgrade-your-capacitor-app-to-capacitor-8), [Capgo: upgrade to Capacitor 8](https://capgo.app/blog/upgrade-capacitor-app-to-capacitor-8/), and the npm packages named above. Capacitor 9 is in alpha (`next` = 9.0.0-alpha.8) and is not used.

**Using plugins without a bundler [C].** The native bridge injected into the WebView does not define `registerPlugin`; the browser build `@capacitor/core/dist/capacitor.js` does. It is vendored as `vendor/capacitor/capacitor.js` (with its SHA-256) and loaded before the app scripts; on the web it reports the `web` platform and nothing else changes.

## 7. Target organization

Pragmatic, sized to the codebase, no framework, no build step:

```
js/core.js               pure rules (unchanged role); new pure helpers: localDateOf, reminderInstant,
                         notificationPlan, pruneDanglingReferences
js/storage.js, backup.js, attachments.js, sync.js     persistence and sync (unchanged roles)
js/platform.js           NEW: DailoPlatform — the only code that knows web vs Capacitor
                         (lifecycle, back button, files, external links, notifications,
                          storage status, durable mirror)
js/*-ui.js               domain adapters (unchanged)
js/app.js                controller; calls DailoPlatform instead of browser-only APIs
tools/build-www.mjs      copies the exact runtime shell (sw.js SHELL_FILES) into www/
capacitor.config.json, ios/, android/   versioned native projects
```

Why each layer: Core stays deterministic and Node-tested; persistence modules own IndexedDB/localStorage; **`platform.js` is the single seam** for everything that differs between a browser and the native app, so `app.js` gains calls, not `if (native)` branches; the build step only copies files so the web version stays build-free.

**Later (with the redesign):** split `app.js` along the blocks in 4.4 (state model, router with an overlay stack, lifecycle/undo, sync controller, reminders controller, views), after a loader helper replaces the text slicing in tests (T-1).

## 8. Data and migration

- **What exists [C]:** section 1. Links are by id (`projectId`, `areaId`, `goalIds`, `tagIds`, `attachmentIds`, Goal `taskIds/projectLinks/habitLinks`, Resource `related*Ids`, habit log id `habitId:date`). Typical metadata is 600 bytes per task.
- **Storage per kind:**
  - small settings: inside the metadata, as today;
  - structured data (tasks, notes, settings): `localStorage.todoAppData` plus the native file mirror;
  - habit logs, goal history, recovery snapshots: IndexedDB, as today;
  - attachments: real Blobs in IndexedDB (they survive restarts [C]); natively they are written to the cache directory only to share or open, then deleted;
  - tokens: localStorage today, Keychain/Keystore later (S-3).
- **Versioning:** metadata schema stays V3, IndexedDB stays v1, ZIP format stays 2. No schema change is needed for the migration; the native mirror stores the exact `todoAppData` text.
- **Integrity and recovery:** the existing load path validates, migrates and refuses to overwrite invalid data; the mirror is only used when `todoAppData` is missing, and then goes through the same validation. A corrupt mirror is ignored (and reported), never written over newer data.
- **App upgrades:** the app ships its web files inside the binary; no service worker; schema migrations run at start as they do today.
- **Moving data from the PWA to the app (different origin) [C]:** the Safari/Chrome storage of the PWA is not visible to the app. Two existing paths:
  1. ZIP: export in the PWA, import in the app (Settings → Data). Carries everything, including attachments and goal history, within the import limits (E-1).
  2. Sync account (when configured): carries records and habit logs, not attachments or goal history.
  The app shows a first-run notice that offers both, and the first sync from untouched sample data uses the account instead of merging the samples.
- **Offline:** everything works offline; sync retries on resume, on reconnect and every five minutes, as today.

## 9. Capacitor strategy

- **Targets:** iOS and Android (approved in the V2.0 spec), plus the existing web/PWA.
- **Build chain:** `npm run build` (copies the shell to `www/`) → `npx cap sync` → Xcode / Android Studio (or `npx cap run ios|android`). `webDir` is `www`; `www/` and `node_modules/` are ignored by git; `ios/` and `android/` are versioned.
- **App id:** `cloud.ivapix.dailo`, name "Dailo".
- **Production vs development:** production loads the packaged `www/` (no `server.url`). Live reload, when wanted, uses `npx cap run android --live-reload --host <lan-ip>` on the developer's machine only; nothing is committed for it.
- **Server-side functions:** only Supabase (Auth + PostgREST + `delete_my_account` RPC); the app calls it over HTTPS with the public key, as the web version does.
- **Plugins:** official only — App (lifecycle, Back), Filesystem + Share (files), Local Notifications (reminders), Keyboard (resize). SystemBars is part of Capacitor 8 core (insets as CSS variables).
- **Native behavior to cover:** safe areas (CSS `env()` plus the SystemBars variables), keyboard (no popover close on height-only resize, `100dvh`, 16 px fields), Android Back (overlay → route → minimize), pause/resume (flush, mirror, date rollover, reminders, sync), external links and `mailto:` (system browser/mail), files (save/share export, open attachments through the share sheet, import through the file input), reminders (permission, schedule, update, cancel, tap → item), notification taps on cold start (listener registered before the first render). When a permission is refused or a plugin is unavailable, the app keeps the in-app reminders and explains the state in Settings.

## 10. Open questions (only those that change decisions)

1. **Habit weekly target history (H-1):** should a change of "X times per week" or of the week start apply only from the current week on (store the target per period) or to all history, as today?
2. **Daily habit reminders after the day's check-in:** keep firing (today's behavior) or stay silent?
3. **Search performance:** may Search get a short debounce and a result cap? (The compatibility rule forbids changing Search without approval.)

None of them blocks the migration phases.

**Answered 2026-10-09:** "1. samo od promene 2. ne 3. može" — implemented as M11 (`2026-10-09-habit-history-reminders-search.md`).
