# Redesign R15 — Još as tiles and the Nalog screen (design)

**Date:** 2026-10-10 · **Status:** the user's request with a screenshot of "Još": "sve na strani podesavanja neka bude u dve kolone (ikonica gore, tekst dole). dole gde su podesavanja dodaj jos jednu karticu, nazovi nalog ili profil". It amends M4 and M5 of `2026-10-08-redesign-decisions.md` · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.38`.

## What changes

1. **"Još" in two columns (M4 amended).**
   - **The groups stay:** Zakačeno, Planiranje, Biblioteka, Arhiva, and the last group without a title.
   - **Each group is a grid of tiles in two columns.**
   - **A tile has:**
     - its icon on top, in a small tinted square;
     - the count, if there is one, at the top right;
     - the name below, with an optional small line under it (an area or saved view for pinned tiles, the account state for Nalog).
   - **No arrow:** the whole tile is the button.
   - **Unchanged:** the routes, the counts and the order.
2. **"Nalog" next to "Podešavanja" (M5 amended).** The last group has two tiles: "Podešavanja" and "Nalog".
   - **The Nalog tile's line** reads:
     - the e-mail address when signed in;
     - "Prijava" when sync is set up but no one is signed in;
     - "Podaci su samo na ovom uređaju" when sync is not set up.
   - **The tile opens the new "Nalog" screen** (route `#account`, rendered by `js/settings-ui.js`).
   - **Signing in, the code, the last sync, "Sinhronizuj", "Odjavi se" and "Obriši nalog"** move to the Nalog screen. Podešavanja no longer has the "Nalog" group. The steps and actions are the same as before.
   - **Without sync set up,** the Nalog screen explains that there is no account yet:
     - everything stays only on this device;
     - backups are in Podešavanja → Podaci;
     - a "Podešavanja" button leads there.
   - **The Podešavanja tile** loses its sync line, since Nalog shows it.
3. **Re-rendering after sync events** (`refreshSyncCard`) covers the Nalog screen as well as Podešavanja.
4. **Scope of the tile style.** Only the Još groups get the tiles (`.more-card.more-tiles`). The area screen keeps its project list in `.more-card`.

## Compatibility

- **Data:** unchanged.
- **Sync:** the sync code and its device-local key are unchanged.
- **Older tests** that pinned the sync card in Settings (`sync-app-v2-0a`, `redesign-r10g`) or the Još rows (`redesign-r1`) are rewritten with an R15 note.

## Tests (written first)

`tests/redesign-r15.test.js`:

- the tile markup;
- the two-column grid styles;
- the Nalog tile and its line in the three states;
- the route, the screen with and without sync;
- the Settings groups without Nalog;
- the refresh hook;
- the Serbian text;
- the version `2.0.0-alpha.38`.

`npm run smoke` adds: Još shows tiles with the Nalog tile, and Nalog opens the screen explaining the local-only data.
