# Working rules for Claude

## Before editing

1. Read `CLAUDE.md`, `AGENTS.md` and `docs/claude/CONTINUATION.md`.
2. Inspect the current source, relevant tests and the current progress ledger (`docs/superpowers/progress-v1-9.md`; V1.7 remains the behavior baseline ledger).
3. Identify whether the requested behavior already exists in a different UI module or derived view.
4. Preserve existing V1.2–V1.6 behavior unless the approved V1.7 design explicitly changes it. Treat any V1.8 redesign as a visual change until a new spec says otherwise. V1.9 changes only what its approved spec lists (install, offline, data protection, Serbian UI, version/problem report, fixes G1–G3).

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
- Keep the app working offline: no new CDN or remote runtime reference; vendor assets with their license files.

## Code boundaries

- Put pure domain rules and projections in `js/core.js`.
- Keep persistence and IndexedDB transactions in `js/storage.js` and attachment operations in `js/attachments.js`.
- Keep ZIP validation/export/import in `js/backup.js`.
- Put screen-specific markup/actions in the relevant `js/*-ui.js` module; use `js/app.js` for orchestration, routing, global events and cross-cutting overlays.
- Do not rename persisted keys or IDs without an explicit migration and tests.
- Prefer small additive changes over broad rewrites of `js/app.js`.
- Add every new runtime file (script, stylesheet, font, icon) to `SHELL_FILES` in `sw.js`; `tests/offline-v1-9.test.js` fails otherwise.
- Bump `APP_VERSION` in `js/release.js` and `VERSION` in `sw.js` together for a release.
- New CSS goes into the V1.9 layer (or a later layer) before the phone touch-target guard, which stays the final rule.

## Localization (i18n) rules

- Every user-visible string goes through `tr()`, `trn()` or `msg()` with a quoted literal English key, e.g. `tr('Export backup')`. Template-literal keys are rejected by `tests/i18n-v1-9.test.js`.
- Use `{name}` placeholders for values (`tr('Last backup: {date}.', { date })`); never splice Serbian sentences from fragments or build plurals with `${word}s`.
- Plurals use `trn(count, one, other, params)` and a catalog entry keyed by the English "other" form with Serbian `one`/`few`/`other`.
- Use `msg()` for keys that are stored or thrown (lookup-table labels, `validationResult` sentences, errors) and translate them where they are shown with `tr()` or `trMessage()`. Dynamic errors use the "Prefix: detail" shape so the prefix can be translated.
- Add the Serbian (Latin script) entry to `js/i18n-sr.js` in the same change. The completeness test rejects missing keys, unused entries and placeholder mismatches.
- The untranslated-text audit in `tests/i18n-v1-9.test.js` fails on literal English in markup: text nodes and `aria-label`/`aria-description`/`title`/`placeholder`/`alt` values in `js/*.js` may contain only `${…}` expressions and the allowlisted words `Dailo`, `https`, `ZIP`, `JSON`, `RESET`, `RESTORE`. `index.html` is written in Serbian directly.
- Use the approved glossary in `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md` (section F) for product terms.
- Format dates and numbers with `I18n.locale()` (`sr-Latn-RS` in the browser), never `undefined` or `'en'`.
- Do not translate persisted values, IDs, enum values or the typed words `RESET`/`RESTORE`.
- Node tests stay English. In VM sandboxes use `withI18n`/`runInNewContextWithI18n` from `tests/support/i18n.js`; when a test matches source text, update its literal to the `tr(…)` source with the same intent, never weaken the assertion.

## Verification rules

- Add or update a focused Node test before implementing new behavior.
- Run the focused test, then the complete `node --test tests/*.test.js` suite.
- Run JavaScript syntax checks (`for file in js/*.js vendor/*.js tests/*.js tests/support/*.js sw.js; do node --check "$file"; done`) and `git diff --check`.
- State exactly which checks ran and which did not.
- Do not claim browser, visual, keyboard, mobile, iPhone install/offline or Serbian-wording acceptance unless it was actually demonstrated in a user-owned browser or device.
- Do not use isolated Chromium as a substitute for the user's Chrome in this project workflow.

## Documentation rules

Mark statements as one of:

- **Implemented** — visible in current source and backed by a focused test or direct code path.
- **Automated-tested** — verified by the listed automated command.
- **Manual-pending** — requires a real browser/device interaction not run in the current environment.
- **Deferred** — intentionally outside the approved scope.

When a document is stale, update it with the current version/date and explain the changed behavior instead of deleting historical context.
