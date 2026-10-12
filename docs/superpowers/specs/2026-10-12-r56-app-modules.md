# R56 — js/app.js starts to split into modules

**Date:** 2026-10-12 · **Status:** the user's request (improvement 8, "moze sve"). · **Release:** `2.0.0-alpha.83`. · **Plan:** `docs/superpowers/plans/2026-10-12-app-js-modules.md`.

## The change

Nothing changes for the user. The code moves:

- **`js/sidebar-ui.js`:** the desktop sidebar of R47a becomes a domain module named `sidebar`.
  - **Moved:** `sidebarHtml(ctx)`, `sidebarProjectGroups(ctx)`, `readSidebarFolds()`, `toggleSidebarFold(ctx, group)` and `toggleSidebar(ctx)`. The device-local keys `dailoSidebar` and `dailoSidebarFolds` are unchanged.
  - **`renderRoute`:** answers `{ type: 'sidebar' }` with the sidebar's markup.
  - **`handleAction`:** answers `toggle-sidebar` and `sidebar-fold`.
- **`js/app.js`** keeps only the glue:
  - `renderSidebar()` hides the sidebar during recovery and fills it with `callDomainHook('renderRoute', { type: 'sidebar' })`.
  - The `[` key calls `callDomainHook('handleAction', 'toggle-sidebar', null)`.
  - `domainContext()` adds `bottomNavRoute`, `activeInboxRecords` and `renderSidebar`.
- **Loading:** `index.html` loads the module after `js/journal-ui.js` and before `js/app.js`; `sw.js` precaches it, so `npm run build` copies it into `www/`.
- **Tests:** `tests/support/source.js` adds:
  - `functionSource(name)`, which finds a top-level function in any `js/*.js` file;
  - `appSource()`, which reads `app.js` with the modules split out of it.

  `tests/redesign-r47a.test.js` now uses it, with the same assertions.

## Checks

- **Node:** `tests/modules-r56.test.js`, written first; it failed 5/5. It covers:
  - the helper (a function in a module, a function in `app.js`, a missing function);
  - the module's registration and the functions that left `app.js`;
  - the glue line, the `[` key and the context line;
  - the load order and the precache;
  - the plan and the version.
- **Unchanged tests:** the R47a tests pass on the moved code (8/8).
- **Smoke:** the smoke test boots the app with the module.
- **Manual-pending:** the sidebar in a wide browser window (the same look and behavior as `2.0.0-alpha.76`).
