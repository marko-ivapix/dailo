# Operational UI Upgrade

> User-approved direction: improve both functionality and visual quality across the app, while preserving the V1.3 data model, local-first safety, global Search behavior, no-bulk rule, and the incumbent Universal Brand Design System.

## Product intent

Make the desktop app feel like a focused daily operating environment. Today is the command center; every secondary screen should make planning, organizing, or reviewing faster without becoming a competing dashboard.

## Visual direction

- Preserve the dark, technical, high-contrast BDS foundation: Space Grotesk headings, Geist interface text, Phosphor icons, electric blue actions, mint completion, yellow warning, red danger.
- Improve hierarchy through denser but breathable layout, sharper surfaces, clear section headers, restrained status color and meaningful empty/loading/error states.
- Avoid glassmorphism, metric-dashboard clutter, decorative gradients, generic oversized cards, and cosmetic animation that does not communicate state.
- Keep desktop as the primary target. Existing responsive behavior must remain usable; reduced-motion rules remain respected.

## Delivery order

### 1. Operating shell and reusable UI language

Refine sidebar grouping/active state, page headers, section headers, action rows, card/list surfaces, form fields, modal structure, inline feedback and empty states. Reuse existing CSS variables and classes where possible; no new framework or component runtime.

### 2. Today command center

Give Today a clear daily hierarchy: top-level date/focus context, differentiated task, habit, goal and overdue sections, useful counts/progress cues, and direct existing actions. Do not add a new task source, change task ordering semantics, alter Search, or introduce bulk operations.

### 3. Goals, Habits and Calendar operating surfaces

Make progress, routine/check-in state, milestone urgency, lifecycle state and planning dates easier to scan and act on. Reuse existing Goal/Habit/Calendar mutations and existing domain adapters; do not change progress formulae, schedule rules, drag behavior, reminder semantics, history persistence or deletion safety.

### 4. Notes, Resources and final interaction states

Improve list/detail readability, attachment/link affordances, Area context, action grouping, and empty/error states. Reuse the existing Knowledge adapter and shared attachment/delete paths; do not introduce new storage, rich-text, cloud/share, Search changes or bulk actions.

## Functional additions allowed in this upgrade

- Faster access to existing safe actions from the relevant surface.
- Read-only contextual summaries/progress/status that are derived from existing state.
- Clearly labeled existing actions and states; no hidden data mutation.
- UI-only loading/error feedback where an existing async source is already used.

Any new persisted field, new global keyboard shortcut, change to task derivation/order, new data store, changed Search semantics, or changed delete/Undo behavior is outside this design and requires a separate approved design.

## Architecture and safety

- Retain `app.js` as state/persistence/overlay/global-event authority and retain the static domain-adapter boundaries.
- UI work belongs in the relevant adapter plus CSS. A cross-domain display may receive callbacks/context from `app.js` but cannot independently use localStorage/IndexedDB or install global listeners.
- Preserve focus/Escape behavior, the global storage warning, confirmation → delete → Undo, attachment ownership, recovery/backup, and all existing route/action identifiers unless an implementation plan explicitly documents a compatible change.

## Verification mode

The user selected fast-prototype mode. Each slice receives scoped source inspection, `node --check`, and `git diff --check`, but browser and full automated acceptance runs remain deferred until the user explicitly starts the verification pass.
