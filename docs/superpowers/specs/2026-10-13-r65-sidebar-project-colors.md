# R65 — project colors in the sidebar, a stronger "Projekti"

**Date:** 2026-10-13 · **Status:** the user's request, with a screenshot of the wide-screen sidebar: "da li moze boja pozadine iza ikonica da bude boja koju smo izabrali za taj projekat. takodje ovo projekti bih nekako malo vise naglasio nego sto je trenutno". · **Release:** `2.0.0-alpha.92`. No data-model change: the color is the project's existing `color`.

## The change

- **The folder on the project's color** (`js/sidebar-ui.js`):
  - Each project in the sidebar shows its folder on a 22 px rounded square filled with the project's color (`.sidebar-project-icon`, `--project-color`).
  - The color passes `Core.safeColor` with the default blue as the fallback.
  - The folded sidebar shows the same colored squares.
- **A light color gets a dark folder** (`is-light`, the new token `--on-light-accent: #14171B`):
  - The test is relative luminance above 0.19. Above it, dark ink contrasts more than white.
  - Of the eight project colors, only the blue `#5362FF` keeps a white folder.
  - Three-digit colors are expanded first.
- **"Projekti":** its group gets `is-projects`. The title is `--ink-1`, `--text-sm` and bold, so it stands out from Zakačeno, Planiranje and the others. The area subtitles under it stay quiet.

## Checks

- **Node:** `tests/sidebar-colors-r65.test.js`, written first; it failed 4/4. It covers:
  - the rendered sidebar, with the color, the light case, the unsafe-color fallback and the plain icons elsewhere;
  - every palette color;
  - the heading and the CSS;
  - the version.
- **Older test:** `tests/sign-out-r64.test.js`, where the version is now "or later".
- **Chromium at 1440 px:** checked in the dark and light themes and with the sidebar folded.
- **Manual-pending:** the look in the user's own browser.
