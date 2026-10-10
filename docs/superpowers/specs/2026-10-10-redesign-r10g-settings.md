# Redesign R10g — Podešavanja and the retired sidebar (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.25`.

## What changes

1. **Settings groups (M5).**
   - **Nalog:** Sinhronizacija, the existing sign-in and account rows. It is shown when sync is configured, as before.
   - **Opšte:** Prvi dan nedelje, Dnevni kapacitet, Podsetnici. A choice applies at once; the "Sačuvaj podešavanja" button leaves. A week-start change still applies to habit weeks only from the change on (M11).
   - **Podaci:**
     - **Rezervna kopija:** the status, "Izvezi ZIP", and the backup reminder inside;
     - **Vrati iz kopije:** "Uvezi ZIP";
     - **Lokalni snimci;**
     - **Trajno čuvanje;**
     - **Popuni primerima;**
     - **Resetuj aplikaciju,** in red.
   - **Pomoć:**
     - **Uputstvo;**
     - **Prijavi problem,** shown only when an address is set, as before;
     - **Instaliraj aplikaciju,** only while Dailo is not installed;
     - **Privatnost;**
     - **O aplikaciji,** with the version.
   - **Računar:** "Prečice na tastaturi" and "Zbijeniji prikaz". They are shown only on a wide screen with a mouse (K11). Density applies at once.
2. **Settings that leave (M6):**
   - "Izgled / Tema", since dark is the only theme;
   - "Vrati podrazumevana podešavanja" with the Save button;
   - the "Obriši završene zadatke" row, which moved to Završeni zadaci in R10e.
3. **The sidebar is retired.** Since R1 the bottom bar and "Još" are the navigation at every width, and the sidebar was rendered but hidden. Removed:
   - its markup;
   - its render function and actions (collapse, section folds, the "More" menu);
   - `ui.sidebarCollapsed` and `ui.sidebarSections`.

   The desktop layer K1–K12 stays deferred (plan, "Phone design everywhere"). It will bring its own sidebar.

## Compatibility

- **Data:** unchanged.
- **The settings keep their keys and checks:** `weekStartsOn` with its history, `dailyCapacityMinutes`, `backupReminderDays`, `compactDensity` and `shortcuts`.
- **Stored keys:** an old stored `ui.sidebarCollapsed` or `ui.sidebarSections` is ignored.
- **CSS:** the sidebar rules stay unused until the desktop layer.

## Tests (written first)

`tests/redesign-r10g.test.js`:

- the five groups in order with their rows;
- the hidden install row once installed;
- the desktop-only group;
- week start and density applying on change;
- the removed rows and buttons;
- no sidebar markup or code;
- the version `2.0.0-alpha.25`.

`npm run smoke` adds: Još → Podešavanja → the groups Opšte, Podaci, Pomoć → Prvi dan nedelje → Nedelja applies at once.
