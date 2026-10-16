# R109 — Projekti, a screen of their own

**Date:** 2026-10-16 · **Release:** `2.0.0-alpha.138` · No data-model change.

**Status:** the user asked: "Projektu treba da budu kao sto su ciljevi i oblasti, a trenutno su u sklopu zadataka".
- Until now, Zadaci had a switch "Kad stignem · N | Projekti".
- Još → Planiranje → Projekti (R72) opened that switch.

## The change

- **Projekti** (`#projects`, `renderProjectsScreen` in `js/app.js`) is a screen of its own, as Ciljevi and Oblasti are.
  - **Header:** "Projekti" with the count of projects. Groups of Redovne obaveze are left out.
  - **Rows:**
    - "Bez projekta";
    - the active projects by area (R94);
    - "Na čekanju" and "Nekad", folded;
    - "+ Novi projekat".
  - **Back link:** "‹ Još", or the screen it was opened from (`LIBRARY_ROUTES`).
  - **The floating "+"** makes a project here (`QUICK_ADD_DIRECT['#projects']`), as on Ciljevi.
  - **Bottom bar:** it lights up Još, and so does a project's screen, as for Ciljevi and Oblasti.
- **Zadaci:**
  - It keeps the suggestions for today and "Kad stignem" by project.
  - The switch, its action (`tasks-view`) and its styles are gone.
  - The header says only the open tasks.
  - `ui.tasksView` stays valid for older stored data and is no longer read.
- **Ways in:**
  - Još → Planiranje → Projekti;
  - the computer's sidebar, where Planiranje is now Ciljevi, Projekti, Redovne obaveze and Oblasti, as in Još, with the project list group kept above;
  - the weekly review's "Pregledaj ih";
  - a project's screen and "Bez projekta" go back to "‹ Projekti" when opened directly.
- **Pages:**
  - the guide ("Još → Projekti");
  - the FAQ (what Zadaci shows and where Projekti are);
  - Šta je novo (16 October, to alpha.138).

## Checks

- **Node:** `tests/projects-screen-r109.test.js`, written first; it failed 5/5.
- **Older tests updated, each with a comment naming R109:**
  - `more-menu-r72`: the Projekti tile and the sidebar's Planiranje;
  - `navigation-v1-7`;
  - `projects-r94`: the folds now on the Projekti screen, and the review button;
  - `redesign-r1`: the bottom bar and Z1/Z3;
  - `redesign-r17`, `redesign-r22a` and `redesign-r5`: back links;
  - `redesign-r2`: the suggestions above Kad stignem;
  - `redesign-r22b`: the switch's rules gone;
  - `redesign-r22c`: #projects;
  - `redesign-r32`: `LIBRARY_ROUTES`;
  - `plus-r59`: the "+" on Projekti makes a project;
  - `redesign-r5`: Z5, Z6 and Z7;
  - R108's version pin is now "or later".
- **Smoke:** `tools/smoke-boot.mjs` opens Projekti as a screen with a back link, then a project with "‹ Projekti", and "Bez projekta" from Projekti.
- **Manual-pending:** the phone and the computer's sidebar.
