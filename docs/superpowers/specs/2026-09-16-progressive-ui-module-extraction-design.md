# Progressive UI Module Extraction

> User-approved refactor following the initial Knowledge, Goals and Habits adapters. It makes the static prototype easier to work on in parallel without changing product behavior.

## Boundary

`js/app.js` remains the sole owner of state, persistence, schema migration, recovery, backup, attachment I/O and ownership checks, global Search, route validation, the sidebar, overlays, global event listeners, keyboard/focus behavior, delete/Undo and drag lifecycle.

Each new file is a classic script loaded after `js/domain-modules.js` and before `js/app.js`. It registers one `TodoDomainModules` adapter and can only use the ephemeral callback-oriented context supplied by `app.js`. It must not read storage directly, install listeners, retain application state, duplicate a domain record mutation, or take ownership of attachment/delete/recovery behavior.

## Extraction order

1. `js/saved-views-ui.js`: all Saved Views list/detail/modal/filter UI and its action/input dispatch.
2. `js/projects-ui.js`: Project list/detail/archived rendering and Project modal/menu UI. Existing project creation, template materialization, deletion, Undo and drag stay behind app callbacks.
3. `js/areas-ui.js`: Area list/detail/modal/menu UI and Area-only lifecycle dispatch. Cross-domain linked-item creation remains delegated to existing app/Goal/Habit entrypoints.
4. `js/settings-ui.js`: settings page presentation and shortcut-preference UI. Backup/import/reset/recovery remain app shell commands.
5. `js/templates-ui.js`: template list/editor UI. Template application and cross-domain creation remain app-owned bridges until separately redesigned.
6. `js/calendar-ui.js`: Calendar page/modal/actions after adding a narrowly scoped synchronous drag delegation hook. It must not take over global drag state.
7. `js/tasks-ui.js`: only after the app exposes a `renderTaskRow` delegator plus guarded mutation callbacks. Task attachments, recurrence, delete/Undo, recovery and global event lifecycle remain app-owned.

No empty module files are permitted. A module is added only with a real extracted surface. The first implementation slice is Saved Views because it has no attachment, async, drag or cross-domain mutation path.

## Compatibility requirements

- Preserve the current hash routes, `data-action` and `data-pop-action` strings, element IDs, copy, focus return and Escape behavior.
- When an adapter declines a request, incumbent app behavior must continue. When a module claims a surface, remove that duplicate fallback in the same change.
- Do not change Search, add bulk actions, alter V1.2/V1.3 record shapes, or change BDS markup/classes as incidental cleanup.
- This is prototype-mode refactoring: perform scoped source/diff validation only, and leave browser/manual acceptance for the user’s next preview cycle.
