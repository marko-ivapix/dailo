# Redesign R43 — changing the password and the e-mail address

**Date:** 2026-10-12 · **Status:** point 3 of the next-steps list, which the user approved ("moze 1 i 3"). · **Release:** `2.0.0-alpha.69`.

## Nalog

- **The new rows:** signed in, the account card has two rows under the account:
  - **Lozinka:** "Promena odjavljuje ostale uređaje", with "Promeni".
  - **E-adresa:** the current address, with "Promeni".
- **The sheets:** each row opens a sheet with a form, so Enter sends it and password managers see it. The submit listener is shared with the welcome screen.

## "Promeni lozinku"

- **The fields:** a new password with the R40 rule (at least 8 characters, with a digit and a letter) and its confirmation, then "Sačuvaj lozinku".
- **When the server asks for more:**
  - **A code (`reauthentication_needed`):** the app asks Supabase to e-mail one (`GET /auth/v1/reauthenticate`) and shows a code field. The code goes as the `nonce`.
  - **The current password (`current_password_required`):** the app shows that field, and a wrong one reads "Trenutna lozinka nije tačna".
- **The other devices:**
  - **What happens:** Supabase ends every other session of the account on a new password, so they sign in again.
  - **Where it is said:** the sheet says so, and so does the message "Lozinka je promenjena. Ostali uređaji će se ponovo prijaviti."
- **Accounts without a password:** a Google or Apple account can set one here.

## "Promeni e-adresu"

- **Step 1:** the new address, then "Pošalji kod".
  - **The address you already use:** "To je već tvoja e-adresa".
  - **An address another account uses:** "Drugi nalog već koristi ovu e-adresu".
- **Step 2:** the code, then "Potvrdi".
  - **Which address:** the app tries the new address first, then the current one, because with "Secure email change" (Supabase's default) both addresses get a code and both must confirm.
  - **After the first code:** the sheet says "Jedna adresa je potvrđena. Upiši kod iz druge poruke."
  - **After the last code:** Supabase returns a session with the new address. It replaces the stored one; the sync shadow stays because the account is the same. Then "E-adresa je promenjena: …".
- **Supabase:** the "Change Email Address" template must carry `{{ .Token }}` (the setup guide adds it).

## Client (`js/sync.js`)

- **Calls:**
  - `updatePassword(session, password, { nonce, currentPassword })`;
  - `reauthenticate(session)`;
  - `changeEmail(session, email)`;
  - `verifyEmailChange(email, code)`, which returns `{ session }` or `{ pending: true }`.
- **New messages:** `reauthentication_not_valid` reads as a wrong code and `current_password_invalid` as a wrong current password.
- **The fake server** (`tests/support/fake-supabase.js`):
  - **What it models:** reauthentication, the current-password rule, secure and simple e-mail change, and the end of the other sessions after a new password.
  - **Default:** secure e-mail change is on.

## Checks

- **Node:** `tests/redesign-r43.test.js`, written first; it failed 8/8. It covers:
  - the client against the fake server in each server setting;
  - both sheets in every step;
  - the Nalog rows;
  - the app's password flow with a code;
  - the e-mail flow with its refusals and both confirmations;
  - the wiring and the Serbian strings.
- **Manual-pending:** a real password and address change, and the other device's sign-out after it.
