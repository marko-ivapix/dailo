---
paths:
  - "js/**/*.js"
  - "index.html"
  - "sw.js"
---
# App code (js/, index.html, sw.js)

- Interpolate every user or record value into markup through `esc()`. Colors pass `safeColor` and links allow only http, https and mailto. The CSP forbids inline scripts, so no `on*=` attributes and no `<script>` blocks.
- New user-visible text uses an English source string as the key, with the Serbian (Latin) value in `js/i18n-sr.js`. `tr()` translates at render time; `msg()` marks a key that is translated later.
- Screens are domain modules (`window.TodoDomainModules.register({ name, renderRoute, handleAction })`) and get what they need through `domainContext()` in `js/app.js`. Code moving out of `js/app.js` follows `docs/superpowers/plans/2026-10-12-app-js-modules.md`.
- `js/platform.js` is the only place that knows web from native. App code calls `globalThis.DailoPlatform`.
- **State and storage:** saving goes through `saveState` and `TodoStorage`.
  - A new persisted field needs a data-model spec, backup validation (`js/backup.js`) and sync handling (`js/sync.js`).
  - A new device-local key stays outside state and backups and is listed in CLAUDE.md.
- **Product rules:**
  - no bulk-selection UI;
  - global Search ranking and scope unchanged;
  - deletion is confirmation → delete → Undo with a full snapshot;
  - keyboard shortcuts stay off while typing;
  - overlays close with Escape and Android Back.
- A file added to the app shell is added to `SHELL_FILES` in `sw.js`, and a new script also to `index.html`, in load order.
