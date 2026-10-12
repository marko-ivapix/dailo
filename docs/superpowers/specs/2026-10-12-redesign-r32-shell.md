# Redesign R32 — the shell after the third design pass (design)

**Date:** 2026-10-12 · **Status:** findings 16, 17, 18, 20, 21, 28, 30, 31 and 37 of `docs/superpowers/specs/2026-10-12-design-pass-3.md`, which the user approved with "moze sve". · **Release:** `2.0.0-alpha.58`.

## What changes

1. **Status bar** (16).
   - **The strip:** an opaque strip in `--bg-primary` covers `env(safe-area-inset-top)`, so content never scrolls under the clock and battery.
   - **No blur:** the strip has no blur, per V1.8.
2. **Back and the "‹" links** (17).
   - **Navike is a tab:** `ROOT_ROUTES` now includes `#habits`.
   - **No piled-up history:** a tab and a step back replace the address, so the browser history no longer piles up.
   - **Android Back** with nothing open follows `backTarget`:
     - **Order:** it goes first to the screen this one was opened from, then to the start of the tab (a project → Zadaci, a screen under Još → Još), then to Danas.
     - **On Danas:** the app is minimized.
     - **Browser history:** the platform layer no longer walks it.
   - **"‹ Još":** every screen under Još starts with it (`LIBRARY_ROUTES`), or with the name of the screen it was opened from.
3. **Podešavanja** (18).
   - **Podsetnici:** a new group after Opšte holds notifications, the default reminder time, reminders at the planned time and the journal reminder.
   - **Notification button:** it shows only when it does something.
     - **Already on or blocked:** the line says so.
     - **The phone row:** it is named "Obaveštenja".
   - **The backup line:** it lists only what is known (the last export, plus an import, a recovery snapshot or a validation once there is one). It no longer shows "Nema" or "Još nije provereno".
   - **Layout:** rows have 10 px padding and 13 px lines. On phones, a button sits under its text at full width.
4. **Contrast and type sizes** (20, 21).
   - **Contrast:** text that used `--ink-4` (3.7:1) uses `--ink-3`, and placeholders do too. `--ink-4` stays for lines and carets.
   - **Type sizes on phones:** task titles are 15 px, the meta line is 12.5 px and screen titles are 26 px.
5. **Toasts** (28).
   - **Announcements:** the toast area is no longer a live region. One polite status line announces each message once, Undo messages included.
   - **The "+":** it moves up by the toasts' real height (`--toast-stack`).
6. **Android theme** (30).
   - **The theme:** `AppTheme.NoActionBar` is dark (`Theme.AppCompat.NoActionBar`), with `@color/dailoBackground` (`#0F1114`) as the window background, set in the new `values/colors.xml`.
   - **The effect:** the keyboard and system-bar areas no longer show light strips.
7. **Installing from the browser** (31). Pomoć → Instaliraj aplikaciju speaks to the browser in use:
   - **iPhone:** the Safari steps.
   - **Chromium:** while the browser offers its own install (`beforeinstallprompt`), an "Instaliraj" button.
   - **Other browsers:** "U meniju pregledača izaberi Instaliraj ili Dodaj na početni ekran."
8. **The Nedeljni pregled tile** (37). It says "Vreme je za pregled ove nedelje" while this week is due, and otherwise "Poslednji: …".

## Checks

- **Node:** `tests/redesign-r32.test.js`. Older tests that pinned the replaced code (V1.7 accessibility, M3 platform, M4 Back, V1.11, R10g, R14, R15) gained R32 notes or updated patterns.
- **Smoke:** it checks Back from Kalendar to Danas, "‹ Još" on Podešavanja and the Settings groups.
- **Manual-pending:** visual and device checks, including Android Back on a phone and the status-bar strip under a notch.
