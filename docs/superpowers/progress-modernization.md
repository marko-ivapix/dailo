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
| M1 tooling | (this commit) | `package.json` (scripts `test`, `check`, `verify`, `build`; Node ≥ 22; version = APP_VERSION), `package-lock.json`, `.gitignore` (`node_modules/`, `www/`), `tools/shell-files.mjs`, `tools/build-www.mjs` (41 shell files, no `sw.js`), `tools/check-syntax.mjs`. `npm run verify`: syntax 79/79, Node 399/399 (6 new in `tests/tooling-m1.test.js`). |
