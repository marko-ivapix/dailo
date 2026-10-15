# R80 — The sync state on the phone

**Date:** 2026-10-15 · **Status:** point 5 of the outside review ("Pokazivač stanja (sinhronizovano / čeka / greška)"), accepted by the user ("Sve se slažem…"). Before this step, the state showed only on the Nalog screen and in the computer's sidebar, and the sidebar showed no failure. · **Release:** `2.0.0-alpha.107`. No data-model change.

## The change

- **`syncStatus()` (`js/app.js`):** one line for the state. It is passed to the screens through `domainContext`. The states, in order:

  | State | Line |
  | --- | --- |
  | `off` | "Podaci su samo na ovom uređaju" |
  | `signed-out` | "Nema prijave na nalog" |
  | `running` | "Sinhronizacija u toku…" |
  | `offline` (`navigator.onLine === false`) | "Čeka se veza" |
  | `error` (the last round failed) | "Sinhronizacija nije uspela — pogledaj Nalog." |
  | `ok` | "Sinhronizovano HH:MM", or the e-mail before the first round |

- **Još → Nalog:** the tile shows the line. Signed out, it still says "Prijavi se".
- **The "Još" tab:** a small red dot (`#mobile-sync-alert`, `.mobile-bottom-nav-alert`, `--danger`) shows while the last round failed. It carries `role="img"` and the label "Sinhronizacija nije uspela".
- **The computer's sidebar:** it uses the same line, so it now shows a failure and waiting for a connection too.
- **Refreshing:** a change of state re-renders Podešavanja, Nalog and Još. On other screens only the dot and the sidebar are redrawn (`refreshSyncCard`). Losing the connection refreshes them at once, and coming back also syncs, as before.

## Checks

- **Node:** `tests/sync-status-r80.test.js`, written first; it failed 6/6. It covers:
  - every state;
  - the Nalog tile;
  - the dot and its CSS;
  - the refreshes and the sidebar;
  - Serbian;
  - the version.

  The online/offline assertion was added to it with the listener.
- **Older tests updated (with comments):**
  - `tests/redesign-r15.test.js`: the More harness loads `syncStatus`, and `refreshSyncCard` includes Još;
  - `tests/redesign-r40.test.js`: harness stubs for the dot and the sidebar;
  - `tests/more-menu-r72.test.js` and `tests/sidebar-colors-r65.test.js`: a `syncStatus` stub;
  - `tests/notification-tomorrow-r79.test.js`: the version is now "or later".
- **Chromium (390 px):** a signed-in session with the server blocked.
  - The last round failed ("Network unavailable"), the dot showed on Još, and the Nalog tile said "Sinhronizacija nije uspela — pogledaj Nalog."
  - Offline, the tile said "Čeka se veza".
- **Manual-pending:** the dot on a real phone, and a real failure and recovery with the account.
