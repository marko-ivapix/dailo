# Redesign R40 — the welcome screen and sign-in with a password, Google or Apple

**Date:** 2026-10-12 · **Status:** asked for by the user with two mockups:

- **The first screen:** "prvi ekran treba da bude slican ovom".
- **Registration:** "ovako slicno za registraciju".

The user then answered three questions:

- **Sign-in:** "E-pošta + lozinka".
- **Other buttons:** "Google, Apple".
- **When the screen shows:** "Pri prvom pokretanju".

**Release:** `2.0.0-alpha.66`.

**Rule change:** this amends decision 2 of the approved V2.0 spec (`2026-10-08-todo-v2-0-design.md`, "e-mail without a password") and the matching line of `AGENTS.md`.

- **The new methods:** sign-in is by e-mail and password, or with a Google or Apple account.
- **What stays:** sign-in is still optional, and Dailo keeps working fully without an account.
- **Apple and Google together:** Apple is offered next to Google, which is what App Store rule 4.8 asks for when a third-party sign-in exists.

## When it shows

- **The rule:** the welcome screen opens at start when all of these hold:
  - sync is set up (`js/sync-config.js`);
  - this device is not signed in;
  - the device-local key `dailoWelcome` is not set.
- **The key:** `dailoWelcome` is device-local, outside state, backups and sync. "Nastavi bez naloga" sets it, and so does any sign-in.
  - **The result:** every device that is not signed in sees the screen once, including a device updated from an older version.
- **When it waits:** it does not open over another window (a shortcut or shared text that started the app), over recovery, or over a storage error. It is then shown at the next start.
- **Closing it:** Back and Escape close it like "Nastavi bez naloga".
- **From Nalog:** when it is opened from Nalog, closing it returns there and sets nothing.

## The screen (after the mockup)

It fills the whole screen, above the bottom bar and the "+".

- **The top:** Dailo's own mark (`icons/icon.svg`), the word "Dailo" and "Planiraj. Fokusiraj se. Uradi više." over soft waves drawn from the blue tint token.
- **Sign-in (Prijavi se):** "Organizovaniji dan" and "Pretvori ciljeve u svakodnevni napredak.", then:
  - **The fields:** E-adresa (envelope) and Lozinka (lock), with an eye button that shows the password.
  - **The links and buttons:** "Zaboravljena lozinka?", the big blue "Prijavi se", the line "ili nastavi sa", and the Apple and Google buttons.
  - **The bottom:** a framed "Nemaš nalog? Registruj se", and under it "Nastavi bez naloga" with "Bez naloga sve ostaje samo na ovom uređaju."
- **Sign-up (Registruj se), after the second mockup:**
  - **The top:** a round "‹" button that goes back to sign-in, then the same mark, word and line.
  - **The heading:** "Napravi svoj nalog" and "Organizovaniji dan počinje ovde.", aligned left.
  - **The fields:**
    - Ime i prezime (person; optional, saved only in the account as `full_name`);
    - E-adresa;
    - Lozinka, with the eye and "Najmanje 8 znakova, sa bar jednim brojem i slovom";
    - Potvrdi lozinku, with its own eye.
  - **The agreement:** a check box "Prihvatam Uslove korišćenja i Politiku privatnosti". Both are links (see below). An account cannot be made without it, and the time of the agreement is saved in the account as `terms_accepted_at`.
  - **The buttons:** the big "Napravi nalog", "ili nastavi sa", wide Apple and Google buttons with their names, and a framed "Već imaš nalog? Prijavi se".
  - **Not here:** the mockup's Discord button (the user chose Google and Apple).
- **Confirming an account (Potvrdi e-adresu):**
  - **The text:** "Poslali smo kod na {email}." and a code field.
  - **The buttons:** "Potvrdi", "Pošalji novi kod" and "Nazad na prijavu".
  - **The link:** the link in the message confirms the account too, and the user then signs in.
- **A new password:**
  - **First step:** an e-mail field, then "Pošalji kod".
  - **Second step:** the code and the new password, then "Sačuvaj lozinku".
- **Errors:** they appear under the fields:
  - a wrong e-mail address or password;
  - a new password shorter than 8 characters or without a digit and a letter;
  - passwords that do not match;
  - the terms not accepted;
  - an address that already has an account;
  - a wrong or expired code;
  - too many requests;
  - no network.
- **Tokens only:** the screen uses tokens alone, so the light theme (R39) and every text size apply.

## Terms and privacy pages

- **The pages:** `uslovi.html` (Uslovi korišćenja) and `privatnost.html` (Politika privatnosti) are new Serbian pages in the style of `uputstvo.html`.
- **What they say:** they describe what Dailo actually does with data:
  - local storage;
  - the optional account with the e-mail address, name and password handled by Supabase Auth;
  - what syncs and what stays on the device;
  - Google and Apple sign-in;
  - deleting the account in Nalog;
  - the contact address `REPORT_EMAIL`.
- **Review:** they are a first draft that the user reviews before the store release, where the V2.0 spec requires a privacy page.
- **Opening them:** like the guide, they are not precached.
  - **The web:** they open in a new tab.
  - **The phone app:** they open in the system browser from their online copies, `Release.TERMS_URL` and `Release.PRIVACY_URL`.

## How sign-in works (Supabase Auth, no new dependencies)

- **The client:** the new calls live in `js/sync.js` (`createClient`):

  | Call | Endpoint | Result |
  |---|---|---|
  | `signUp` | `POST /auth/v1/signup` with `data: { full_name, terms_accepted_at }` | a session when the project confirms automatically, otherwise "confirm" |
  | `signIn` | `POST /auth/v1/token?grant_type=password` | a session |
  | `resendSignUp` | `POST /auth/v1/resend` | the confirmation code sent again |
  | `requestPasswordReset` | `POST /auth/v1/recover` | a reset code |
  | `verifyRecovery` | `POST /auth/v1/verify`, type `recovery` | a session |
  | `updatePassword` | `PUT /auth/v1/user` | the new password |
  | `authSettings` | `GET /auth/v1/settings` | which providers are on |
  | `authorizeUrl` | — | the provider's address |
  | `exchangeCode` | `POST /auth/v1/token?grant_type=pkce` | a session |

- **Confirming a new account:** it uses the existing `verifyCode` (type `email`).
- **The existing OTP call:** `requestCode` stays in the client for the tests, but the app no longer offers the password-free code.
- **Errors:** `SyncError` carries Supabase's `error_code` as `reason`.
  - **An address that already has an account:** Supabase answers sign-up with a stand-in user that has no identities. That counts as `user_already_exists`, and the screen switches to sign-in.
  - **An unconfirmed address:** signing in with it sends a new code and opens the confirm step.
- **Google and Apple (PKCE, RFC 7636):**
  - **Before leaving:** the app checks that the provider is on (`authSettings`); if it is not, it says so. It then makes a random code verifier and keeps it in the device-local sync record (`dailoSync.pkce`).
  - **Opening the provider:** it opens `/auth/v1/authorize` with the S256 challenge.
    - **The web:** the page itself goes there and comes back to its own address with `?code=`.
    - **The phone app:** the system browser opens, and the provider returns to `dailo://auth?code=`.
      - **Android:** a `VIEW` intent filter for `dailo://auth`.
      - **iOS:** the `dailo` URL scheme in `Info.plist`.
      - The browser sheet is closed when the link arrives.
  - **Finishing:** the code and the verifier are exchanged for a session, and the verifier is removed. The address is cleaned so a reload does not repeat it.
- **After any sign-in:**
  - **What runs:** the same steps as before. The sync shadow is kept for the same account and starts fresh for another, the first sync runs, and the first-sync choice or the M9 example replacement applies.
  - **What it says:** "Prijava je uspela: {email}".
- **The session's name:** the session keeps `user.name` from `full_name` (or `name`). Nalog shows it above the e-mail address.
- **Nalog when signed out:** it explains sync and offers "Prijavi se" and "Napravi nalog", which open the same screen. The signed-in card is unchanged.

## What the user sets up in Supabase (guide `docs/v2/podesavanje-supabase.md`)

1. **The Email provider:** keep it on with "Confirm email". Set the minimum password length to 8.
2. **The e-mail templates:** "Confirm signup" and "Reset password" contain `{{ .Token }}`, so the message carries the code the app asks for.
3. **URL Configuration:** the Redirect URLs are `https://marko-ivapix.github.io/dailo/` and `dailo://auth`.
4. **Google:** an OAuth client of the "Web application" type, with the redirect `https://qjfpnvjuqbrmdkjxxmsq.supabase.co/auth/v1/callback`. Its ID and secret go into Supabase → Google.
5. **Apple:** this needs the Apple Developer Program. It takes a Services ID, a "Sign in with Apple" key and the same callback, then Supabase → Apple. The secret expires every six months.

Until a provider is on, its button says that sign-in with that account is not turned on yet.

## Checks

- **Node:** `tests/redesign-r40.test.js`, written first. It covers:
  - the client calls against the extended `tests/support/fake-supabase.js`;
  - the PKCE challenge against the RFC 7636 example;
  - every mode of the screen;
  - when the screen opens and what closing it does;
  - sign-in, sign-up with a code, the password reset, and Google from leaving to the session;
  - the Nalog card, the Android and iOS links, the precached Google mark, and the translations.
- **Old tests updated:** the OTP form tests (V2.0-a, R15, R22b) and R39's exact version.
- **Smoke:** the first start shows the screen. "Nastavi bez naloga" closes it and sets the key, and the second start does not show it again.
- **Manual-pending:**
  - a real sign-up, sign-in and password reset;
  - Google and Apple on the web, Android and iPhone;
  - the look on a phone, in both themes;
  - **the iPhone Home Screen web app:** Google and Apple sign-in may not return to it, because iOS opens the provider outside the installed web app. E-mail and password work there.
