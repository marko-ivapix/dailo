# Redesign R36 — capture and triage additions after the third design pass (design)

**Date:** 2026-10-12 · **Status:** additions C, G and K of `docs/superpowers/specs/2026-10-12-design-pass-3.md`, which the user approved with "moze sve". · **Release:** `2.0.0-alpha.62`.

## What changes

1. **Faster capture** (C).
   - **"Dodaj i nastavi":** it sits beside "Dodaj zadatak" in Quick Add. It saves the task and keeps the sheet open for the next one, like ⇧↵ on a keyboard. On a touch screen the two buttons share the row at 48 px.
   - **A toast after each new task:** it says where the task went, and "Otvori" opens it.
     - **Where:** "Dodato u Inbox", "Dodato u Danas", "Dodato za sutra" (or another date), "Dodato u {projekat}" or "Dodato u Kad stignem".
     - **How long:** it stays 5 seconds and never replaces Undo.
     - **Not shown:** after "Više opcija", because the task window opens anyway.
   - **The Inbox add row:** a field at the top of Inbox, shown also when Inbox is empty.
     - **Enter or "+":** it files the title straight into Inbox, keeps the row ready for the next title and leaves the keyboard up.
     - **Still read:** `#oznaka` and `!prioritet`.
     - **Not read:** dates, `+projekat` and `@oblast`, so the task stays in Inbox.
   - **Holding the "+":** it opens a new task at once (Quick Add for the screen's context) with a light tick, whatever a tap does there (the menu or a direct "Nov cilj").
2. **Triage** (G).
   - **"Razvrstaj redom":** a task also gets "Datum…" (the plan date sheet) and "Otvori". The task window opened from there returns to the sorting when it closes.
   - **The plan date sheet chips:** Danas, Večeras, Sutra, Vikend and Početak sledeće nedelje.
     - **"Večeras":** today at 20:00, offered only before 20:00.
     - **"Vikend":** the coming Saturday, or today on a Saturday (`Core.weekendDate`).
   - **The reminder sheet:** it starts with "Za 1 h", rounded up to five minutes.
3. **The gesture hint** (K).
   - **When:** once, on a touch screen, while Danas shows tasks.
   - **The text:** "Prevuci zadatak udesno da ga završiš, ulevo da mu izabereš datum. Drži red pa ga prevuci da promeniš redosled."
   - **"U redu":** it hides the hint on this device (device-local key `dailoGestureHint`, outside state, backups and sync).

## Data

- **No new field.** A task from the Inbox row is an ordinary Inbox task.
- **Device-local key:** the only new key is `dailoGestureHint`.

## Checks

- **Node:** `tests/redesign-r36.test.js`.
  - **Old tests updated:** the harnesses that run `createTask`, `renderToday` or the long press got stubs for the new helpers. These are V1.5, V1.6, V1.10, R2 and R4.
  - **Changed expectations:** R3 (the reminder presets start with "Za 1 h"), R6 (the Inbox add row and the two new triage buttons), R16 (the plan chips, with "Večeras" depending on the hour) and R33 (Fokus or Razvrstaj redom as `returnTo`).
  - **Version check:** R35's version check now reads "≥ 61".
- **Smoke:**
  - a new Inbox task shows "Dodato u Inbox" with "Otvori";
  - the Inbox add row files a title with Enter.
- **Manual-pending:**
  - holding "+" on a phone;
  - the gesture hint on a touch screen;
  - the footer layout at 320 px;
  - visual checks.
