# R108 — Sheet footers above the phone's system buttons

**Date:** 2026-10-16 · **Release:** `2.0.0-alpha.137` · No data-model change.

**Status:** the user reported it on Android, with a screenshot:
- "Na androidu su dugmići preko dugmeta, kada se skrola skroz dole onda je okej. To treba proveriti na vise uređaja".
- In the screenshot, the three system buttons cover "Završi zadatak" in a long task window.

## Why

- **How the app is drawn:** the Android app runs edge to edge. Capacitor's SystemBars (`insetsHandling: "css"`, viewport `cover`) draws the page under the system bars on WebView 140 or newer, and gives the bottom inset to the page. It arrives both as `env(safe-area-inset-bottom)` and as the injected `--safe-area-inset-bottom`.
- **What breaks:**
  - A long sheet scrolls, and its footer is `position: sticky; bottom: 0`.
  - While it scrolls, the footer sits on the very bottom edge of the sheet, which is under the system buttons.
  - Only at the end of the scroll does the sheet's own bottom padding, which already holds the inset, lift it clear.

## The change

- **A token:** `:root` gets `--safe-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))`.
  - The injected value comes first. It reads 0 while the keyboard is open, which matters on WebView 140–143.
  - Otherwise the browser's value is used.
- **The footers:** `.task-window-footer`, `.sheet-footer` and `.quick-sheet-footer` get `padding-bottom: calc(4px + var(--safe-bottom))` and `margin-bottom: calc(-1 * var(--safe-bottom))`.
  - While the sheet scrolls, the button stays above the system buttons, and the footer's solid background covers the area under them.
  - At the end, the negative margin takes the space back from the sheet's bottom padding (`.modal-inner`, `.quick-sheet` and the sheet popover all end with the inset), so the end looks as before.
- **Without an inset** (a computer, or an older WebView that pads the view itself), nothing changes.
- **Šta je novo:** one line. The 16 October range ends at alpha.137.

## Checks

- **Node:** `tests/sheet-footer-r108.test.js`, written first; it failed 4/4. It covers the token, the rule and its place, the sheets ending with the inset, the SystemBars configuration and viewport, and the version.
- **Older tests:** R107's version pin is now "or later".
- **Chromium,** with the bottom inset emulated through `Emulation.setSafeAreaInsetsOverride` on four phone sizes:
  - 360×740, 412×915 and 384×832 with 48 px (three buttons), and 393×873 with 24 px (the gesture bar);
  - **before:** the long task window ("Više opcija" open) had "Završi zadatak" 4 px from the bottom of the screen, under the system area;
  - **after:** 52 px and 28 px from the bottom while scrolling, and the same at the end of the scroll;
  - the new-habit window's Sačuvaj sits 52 px from the bottom;
  - without an inset it is unchanged.
- **Manual-pending:** the user's Android phone and other Android phones (three buttons and gestures), and the iPhone home indicator.
