# R64 — "Odjavi se" returns to the sign-in screen; the start screens keep still

**Date:** 2026-10-13 · **Status:** the user's report: "kada neko klikni na 'odjavi se' idalje se ostaje na tu stranu samo se zameni dugme na prijavi se. a trebalo bi da se odjavi i da ga vrati kao na prvu stranu da se loguje. takodje na racunaru te pocetne strane su mi stranice postale snappy (vrdaju, pomeraju se cudno)". · **Release:** `2.0.0-alpha.91`. No data-model change.

## The causes

- **Sign-out:** `signOutSync` ended the session and redrew the current screen. Nalog stayed open, and its button changed to "Prijavi se".
- **The moving start screens:** reproduced in Chromium at 1440 × 900 against `main` (`2.0.0-alpha.85`, what GitHub Pages serves).
  - Every tap on the sign-in screen redrew the window and replayed the dialog entrance (`modal-in`: 6 px down and 99 % size). This included the eye, Registracija, Zaboravljena lozinka, an error and the back arrow.
  - The whole full-screen page dropped about 10 px and shrank, then slid back each time.
  - R62 (on the work branch, not yet on `main`) already stopped redraws from replaying the entrance; the branch measured no movement.
  - The first opening still slid and scaled the full page like a dialog.

## The change

- **Sign-out:** a new `signOutToWelcome()`, used by the "Odjavi se" button on Nalog:
  - it ends the session on this device (`signOutSync`, as before);
  - it goes to Danas and opens the sign-in screen (`openWelcome('sign-in', { firstRun: true })`);
  - the server is told in the background, so a slow network does not hold the screen.
- **What stays the same:**
  - Data on the device stays, as before.
  - "Nastavi bez naloga" closes the screen and stays on Danas.
  - Cancelling the first-sync choice still only signs out (`signOutSync`), without the sign-in screen.
- **The start screens:** `.modal.welcome-screen { animation: none; }`. The full-screen page only fades in with its backdrop; it no longer slides or scales.

## Checks

- **Node:** `tests/sign-out-r64.test.js`, written first; it failed 3/3. It covers:
  - the order: session gone, Danas, the sign-in screen, then the server;
  - the Nalog button, and the first-sync cancel staying quiet;
  - the CSS;
  - the version.
- **Older test:** `tests/browser-pass-r63.test.js`, where the version is now "or later".
- **Chromium (phone and 1440 px), with the server mocked:**
  - on `main` the "Odjavi se" button leaves the address at `#account`;
  - on the branch it opens `#today` with the sign-in screen, with only `fade-in`;
  - "Nastavi bez naloga" leaves Danas;
  - switching steps and tapping on the sign-in screen moves nothing.
- **Manual-pending:** signing out with a real account on the phone and on the computer. The movement fix reaches the computer once the branch is merged into `main`, because GitHub Pages serves `main`.
