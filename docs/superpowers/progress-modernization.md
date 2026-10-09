# Progress — modernization and Capacitor

Plan: `docs/superpowers/plans/2026-10-09-modernization-capacitor.md`. Audit: `docs/superpowers/specs/2026-10-09-modernization-capacitor-audit.md`. Branch: `feature/capacitor-modernization`.

Only checks that actually ran are recorded as passed. Native compilation, emulators and devices are listed as pending until the user reports them.

## Baseline (340c49f, 2026-10-09)

- Node: 393 tests, 393 passed, 0 failed.
- JavaScript syntax: 75/75. Python AST: 22/22. Path adapter: OK. Registry: 3/3. Browser regressions dry run: static checks pass.
- Environment: Node 22.22.0, npm 10.9.4, Java 21.0.12, Gradle 8.14.3; no Android SDK (`dl.google.com` and `maven.google.com` denied by the network policy); no macOS.

## Phases

| Phase | Commit | Result |
| --- | --- | --- |
| M0 audit and plan | `59f24fe` | documents only |
| M1 tooling | `51da530` | `package.json` (scripts `test`, `check`, `verify`, `build`; Node ≥ 22; version = APP_VERSION), `package-lock.json`, `.gitignore` (`node_modules/`, `www/`), `tools/shell-files.mjs`, `tools/build-www.mjs` (41 shell files, no `sw.js`), `tools/check-syntax.mjs`. `npm run verify`: syntax 79/79, Node 399/399 (6 new in `tests/tooling-m1.test.js`). |
| M2 data and sync correctness | `cbcaf91` | Y-1 `DailoSync` ignores unknown record types (shadow, deletions, first-sync modes); Y-2 `Core.pruneDanglingReferences` before normalizing pulled data; D-1 `Core.localDateOf` at the 8 sites that cut instants to dates; S-1 `Core.attachmentOpensInline` (images, PDF, plain text) and downloads the rest; E-2 snapshot size counts shared lists and Blobs once. Tests first: `tests/data-m2.test.js` 13 failed before, 13 pass after (run with `TZ=Europe/Belgrade`). `npm run verify`: syntax 80/80, Node 412/412. |
| M3 platform boundary | (this commit) | `js/platform.js` (`DailoPlatform`: kind, lifecycle, Android Back, files, external links, storage status), vendored `vendor/capacitor/capacitor.js` (@capacitor/core 8.5.3, SHA-256 `3333389c…`); app.js: no service worker in the app, export and safety ZIP count only when saved, attachments through the share sheet in the app, flush on hidden/pause, resume refresh (`checkDateAndReminders`), links and the guide open outside the app, storage status "app". `tests/platform-m3.test.js` 13 tests (fake Capacitor). New `npm run smoke` (jsdom 29.1.1 dev dependency): boots `index.html`, creates a task in Quick Add, reopens on the same storage and finds it — OK, no script errors. `npm run verify`: syntax 83/83, Node 425/425. |
