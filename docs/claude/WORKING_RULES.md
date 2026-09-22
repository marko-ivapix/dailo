# Working rules for Claude

## Before editing

1. Read `CLAUDE.md` and `AGENTS.md`.
2. Inspect the current source, relevant tests and the current V1.7 progress ledger.
3. Identify whether the requested behavior already exists in a different UI module or derived view.
4. Preserve existing V1.2–V1.6 behavior unless the approved V1.7 design explicitly changes it.

## Product constraints

- Keep the app static, local-first and framework-free.
- Do not add a backend, accounts, cloud sync or speculative dependencies.
- Do not change the existing global Search scope, ranking or semantics.
- Do not add bulk-selection or bulk-action UI.
- Keep Tasks, Projects, Areas, Goals, Habits, Notes, Resources, Templates and Saved Views as separate object types.
- Keep `plannedDate`/`plannedTime` separate from `dueDate`/`dueTime`.
- Preserve the universal normal-delete flow: Confirmation → Delete → Undo.
- Preserve typed `RESET`/`RESTORE`, safety ZIPs, recovery snapshots and rollback guards for global destructive actions.
- Never silently reset malformed or incompatible saved data.

## Code boundaries

- Put pure domain rules and projections in `js/core.js`.
- Keep persistence and IndexedDB transactions in `js/storage.js` and attachment operations in `js/attachments.js`.
- Keep ZIP validation/export/import in `js/backup.js`.
- Put screen-specific markup/actions in the relevant `js/*-ui.js` module; use `js/app.js` for orchestration, routing, global events and cross-cutting overlays.
- Do not rename persisted keys or IDs without an explicit migration and tests.
- Prefer small additive changes over broad rewrites of `js/app.js`.

## Verification rules

- Add or update a focused Node test before implementing new behavior.
- Run the focused test, then the complete `node --test tests/*.test.js` suite.
- Run JavaScript syntax checks and `git diff --check`.
- State exactly which checks ran and which did not.
- Do not claim browser, visual, keyboard or mobile acceptance unless it was actually demonstrated in a user-owned browser.
- Do not use isolated Chromium as a substitute for the user's Chrome in this project workflow.

## Documentation rules

Mark statements as one of:

- **Implemented** — visible in current source and backed by a focused test or direct code path.
- **Automated-tested** — verified by the listed automated command.
- **Manual-pending** — requires a real browser/device interaction not run in the current environment.
- **Deferred** — intentionally outside the approved scope.

When a document is stale, update it with the current version/date and explain the changed behavior instead of deleting historical context.
