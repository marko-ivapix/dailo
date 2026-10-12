# Redesign R39 — a light theme and "Prati sistem" (design)

**Date:** 2026-10-12 · **Status:** addition L of `docs/superpowers/specs/2026-10-12-design-pass-3.md`, which the user approved with "moze sve". It reopens M6 of `2026-10-08-redesign-decisions.md` ("dark is the only theme"), and that decision log records the change. · **Release:** `2.0.0-alpha.65`.

## The choice

- **Where:** Podešavanja → Opšte → **Tema**, with **Tamna**, **Svetla** or **Prati sistem**.
- **The default:** Tamna, so nothing changes until someone chooses.
- **Only on this device:** the choice is stored under the device-local key `dailoTheme`, outside state, backups and sync, like the text size (R37).
  - **Tamna:** removes the key.
  - **Prati sistem:** follows the phone's or computer's light or dark setting while Dailo is open.
- **Applying it:**
  - **Before the first paint:** the small head script `js/appearance.js` sets `data-theme` (and `data-text-size`) on `<html>` before the stylesheet paints, so a light theme does not flash dark first. It is precached and copied into `www/` like every shell file.
  - **On a change:** `applyTheme` in `app.js` sets the same attribute at once.
  - **The browser's own controls:** `<meta name="color-scheme">` follows the choice ("dark", "light", or "dark light" for Prati sistem), as do date pickers and scrollbars.

## The palette

- **Tokens only:** R34 made every colour a token, so the light theme redefines only tokens. One block is written twice, for `:root[data-theme="light"]` and for `:root[data-theme="system"]` inside `@media (prefers-color-scheme: light)`. A test keeps the two blocks identical.
  - **The levels:** `--graphite-950`…`700` become light surfaces: white cards on a #F4F5F7 page.
  - **Other tokens:** lines, ink, the accent colours, the tints, the roles (`--danger-*`, `--blue-tint`, `--ink-wash`, `--selection`, `--scrim`) and the shadows.
- **Contrast:** on the light surfaces, text and accent colours (ink, blue, mint, yellow and red) keep at least 4.5:1, and so do white on the danger button and text on mint. A test computes the ratios.
- **The status bar:** the strip under the status bar keeps a dark colour in both themes (`--status-strip`, #0F1114).
  - **Why:** the phone draws light status icons there. The iOS web app's status bar style is fixed when the app starts, and the Android app's theme is dark.
  - **`theme-color`:** it stays #0F1114 for the same reason.
- **Dark:** Tamna is unchanged.
- **Unchanged colours:** the colours of projects, areas and tags are the user's, and stay as they are in both themes.

## Checks

- **Node:** `tests/redesign-r39.test.js`.
  - **Old tests updated:** R10g ("Tema" is back in Opšte), R32 (the strip uses `--status-strip`) and V1.5 (the `init` harness).
  - **Version check:** R38's version check now reads "≥ 64".
- **Smoke:** Tema → Svetla sets `data-theme`, the device-local key and the color-scheme meta at once, and Tamna removes them.
- **Manual-pending:** visual checks of every screen in the light theme on a phone and a computer, Prati sistem switching while Dailo is open, and the status bar area on iPhone and Android.
