# R74 — The guide follows the app

**Date:** 2026-10-15 · **Status:** the user's request: "Da, ažuriraj uputstvo", after R73 recorded that `uputstvo.html` still described the beta before accounts. · **Release:** `2.0.0-alpha.101`. No data-model change.

## The change

`uputstvo.html` is rewritten to match the source. It stays a public Serbian page ("ti", no gendered forms) with the same look and no script.

- **Title and preview:** "Dailo — uputstvo" instead of "uputstvo za beta testere". The description now names the account and sync (140 characters; `og:description` is the same).
- **Sections:**
  1. **Instalacija:** iPhone, Android and the computer (was "Instalacija na iPhone").
  2. **Nalog i sinhronizacija (new):** Registruj se / Prijavi se / Nastavi bez naloga, the code by e-mail and "Pošalji novi kod", "Sinhronizuj sada", "Zaboravljena lozinka?", "Šifrovan dnevnik", "Odjavi se" (back to the sign-in screen, R64), "Obriši nalog" with `OBRIŠI`.
  3. **Tvoji podaci:** on the device and, with an account, in the EU (Frankfurt), with a link to the privacy policy; "Trajno čuvanje" should say "Uključeno"; removing the app or the site data removes the data on that device.
  4. **Rezervne kopije:** Izvezi ZIP / Uvezi ZIP (was "Izvezi/Uvezi rezervnu kopiju"), the check and the safety copy before restore, `VRATI` (was `RESTORE`), the 7-day reminder on Danas, and the phone app's weekly automatic copy to Dokumenti/Dailo (newest four kept, R27).
  5. **Brzo dodavanje:** the "+" adds the item of the current screen and holding it opens the menu (R59); the quick-add words are unchanged.
  6. **Pokreti i navike (new):** right = done, left = date, hold and drag = order; the three habit states (R61), which keep their place (R66).
  7. **Raspored dana:** Kalendar → a day → "Raspored", "Bez vremena", "Dnevni kapacitet" in Podešavanja → Opšte. Capacity left Danas in T2a.
  8. **Nedeljni pregled:** in Još → Biblioteka (R72); the tile says "Vreme je za pregled ove nedelje". The notice on Danas left in R14.
  9. **Podsetnici (new):** Podešavanja → Podsetnici and "Probni podsetnik"; in the browser only while Dailo is open, in the phone app also when it is closed.
  10. **Bez interneta i nove verzije:** unchanged, plus "with an account, changes are sent when the connection is back".
  11. **Šta još ne radi:** Google and Apple sign-in are not on yet (checked on 2026-10-13); the phone app is not in the stores yet. Sync and closed-app reminders left this list.
  12. **Prijava problema:** Podešavanja → Pomoć (was "O aplikaciji"), the report address, and a link to `pitanja.html`.

## Discrepancy noted

The R72 spec quotes the review tile as "Vreme je za nedeljni pregled". The source shows "Vreme je za pregled ove nedelje" (`Time for this week's review`). The guide and its test follow the source.

## Checks

- **Node:** `tests/guide-r74.test.js`, written first; it failed 9/9. It covers:
  - nothing from the old guide and no gendered forms;
  - the title and the preview;
  - the section order;
  - the account labels, the backup labels, adding, gestures, the schedule and the review;
  - the reminders and the limits;
  - reporting and the FAQ link;
  - the version.
- **Older tests updated (with comments):**
  - `tests/beta-v1-9-1.test.js`: the heading "Instalacija" and the label "Izvezi ZIP";
  - `tests/faq-r73.test.js`: the version is now "or later".
- **Chromium (390 px):** the page has no sideways scroll.
- **Manual-pending:** reading the guide and adjusting the wording. When Google or Apple sign-in is turned on, or the app reaches the stores, "Šta još ne radi" needs an update.
