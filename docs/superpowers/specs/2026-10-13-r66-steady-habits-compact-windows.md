# R66 — habits keep their place; compact choices and a lower main button in the windows

**Date:** 2026-10-13 · **Status:** the user's feedback on alpha.92:

- the screenshot of the habit window: "sve ovo je preveliko, a ovo dugme smanji po visini svuda gde se pojavljuje";
- R61: "imaju 3 stanja, ali se konstantno pomeraju (na tabu "dan") kada promene stanje, nemoj za navike da menjaju pozicije".

**Release:** `2.0.0-alpha.93`. No data-model change.

## The change

- **Habits keep their place:**
  - **Navike → Dan:** each routine group lists the habits in their own order, instead of moving done ones to the bottom (H2).
  - **Danas:** the habit section does the same (T5 moved done habits down).
  - **Not changed:** the Android widget snapshot keeps open habits first, because a widget is read, not tapped through.
- **Compact choices in the windows** (`.view-tabs.habit-window-seg`):
  - Rutina and Praćenje in the habit window, Horizont and Napredak in the goal window, the repeat frequency and the saved-view type.
  - Each choice is 34 px tall instead of 44 px, so the whole control is 42 px instead of 52 px.
  - The other `view-tabs` (Kalendar, Navike, Ciljevi, Zadaci) keep their size.
- **A lower main button:**
  - `.habit-window-save` drops from 48 px to 40 px. It is used by "Napravi naviku", "Napravi cilj", "Zakaži obavezu", "Napravi oblast" and the other windows.
  - `.task-complete-button` ("Završi zadatak") drops from 50 px to 40 px.
- **A finger still gets 44 px:**
  - Each control gets an invisible `::after` that reaches past its edge: 6 px for the choices and 3 px for the button, measured from the padding box.
  - In Chromium on a 390 px phone, the choice is 34 px visible and 44 px to touch; the button is 40 px visible and 44 px to touch.

## The user's reports recorded with this step (as given)

- **R59:** "da".
- **R61:** "imaju 3 stanja", with the movement fixed here.
- **R62 and R63:** "mislim da je okej".
- **R65:** "okej".
- **Account and e-mail** (Serbian e-mails with the code, the link to Dailo, password length, region, SMTP): "Nalog i eposta sve je okej".

## Checks

- **Node:** `tests/habits-steady-r66.test.js`, written first; it failed 5/5.
- **Older tests updated (with comments):**
  - `tests/redesign-r8a.test.js` and `tests/redesign-r2.test.js`: the order;
  - `tests/sidebar-colors-r65.test.js`: the version is now "or later".
- **Chromium:** the sizes and the touch areas measured on a 390 px phone and at 1440 px.
- **Manual-pending:**
  - checking in habits on Dan and on Danas on the phone;
  - the windows on the phone and the computer.
