# Static Domain Module Boundaries

> User-approved refactor for faster parallel prototype work. It preserves behavior and does not replace the static vanilla-JS architecture.

## Goal

Split domain-specific UI behavior out of the growing `js/app.js` so independent agents can work in distinct files after a small shared registration seam is established.

## Design

- Keep `js/app.js` as the sole owner of application state, persistence, global recovery, global Search, overlay lifecycle, route parsing, and the top-level event listener.
- Add `js/domain-modules.js` before `js/app.js` in `index.html`. It owns a minimal registry only; it does not hold application state.
- Each domain file registers an adapter with the registry and receives an ephemeral context object from `app.js` when rendering or handling an action. The context contains only existing helpers required by that domain; adapters never read or write localStorage/IndexedDB directly.
- Start with `js/knowledge.js` for Notes and Resources because it is new, cohesive code. Add `js/goals-ui.js` and `js/habits-ui.js` incrementally as their approved Horizon/Routine features are implemented.
- Adapters use three optional hooks: `renderRoute(route, context)`, `handleAction(action, event, context)`, and `handleInput(event, context)`. `undefined`/`false` means unhandled and leaves existing app behavior unchanged.
- `app.js` iterates registered adapters before its incumbent domain fallback. Routes/actions outside an adapter remain behaviorally identical.

## Constraints

- No ES-module bundler, framework, shared mutable module state, new storage store, or duplicated global event listeners.
- No behavior, data shape, Search ranking/scope, attachment safety, delete/Undo, backup, or recovery change belongs to this refactor.
- Every adapter must preserve keyboard/Escape/focus behavior by calling existing context callbacks rather than replacing overlay logic.
- Script load order remains vendor/core/storage/attachments/backup/domain registry/domain adapters/app.

## Delivery

1. Create the registry/context seam and extract only the currently new Notes/Resources renderer/actions into `js/knowledge.js` without changing output or storage behavior.
2. Implement Goal horizon/month behavior in `js/goals-ui.js` through the same seam.
3. Implement Habit routine/starter behavior in `js/habits-ui.js` through the same seam.
4. Keep remaining legacy domains in `app.js` until an independently justified refactor; do not mechanically split the entire file.

## Prototype limit

The user chose fast-prototype verification, so the refactor gets scoped diff checks and user manual preview rather than a new automated/review cycle. Existing protective behavior may not be simplified away.
