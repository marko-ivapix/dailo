# Redesign R42 — server messages in Serbian and "Proveri server"

**Date:** 2026-10-12 · **Status:** the user chose point 1 of the next-steps list: "make sign-in and sync really work". · **Release:** `2.0.0-alpha.68`.

## Why

- **The gap:** the Supabase steps (migrations, e-mail templates, SMTP, redirect URLs) are the user's to do, and the cloud session cannot reach `supabase.co`.
- **The goal:** the app itself says what is missing.

## Server messages

- **Where they are read:** `js/sync.js` reads Supabase's answers into sentences the app translates (`serverMessage`). The reasons come from three places:
  - Auth's `error_code` (older servers send `error` and `error_description`);
  - PostgREST's `code`;
  - for the e-mail errors, the text of the message.
- **Auth reasons:**
  - wrong e-mail or password;
  - an unconfirmed address;
  - an address that has an account;
  - a weak password;
  - too many requests (429);
  - an expired code;
  - an address the built-in mail server may not write to, because there is no own SMTP;
  - a failed e-mail;
  - registration turned off;
  - an invalid address;
  - the same password;
  - a sign-in method turned off;
  - an app key the server refuses.
- **PostgREST reasons:**
  - missing tables or the account function (`PGRST205`, `PGRST202`, `42P01`): run `0001_sync.sql` and `0002_journal.sql`;
  - a journal record refused by `records_type_check`: run `0002_journal.sql`.
- **Unknown answers:** they keep "Greška na serveru: <detail>".
- **No network:** "Mreža nije dostupna", without the browser's English detail.
- **`SyncError.reason`:** it now also carries PostgREST's code.
- **The welcome screen:** it uses these sentences directly. Only a refused code reads "Kod nije tačan ili je istekao" whatever the cause.

## "Proveri server" on Nalog

- **Where:** in the account card, signed in or not. It is a row "Server" with the button "Proveri server" ("Proveravam…" while it runs).
- **What `syncClient.checkServer()` reads:**
  - `GET /auth/v1/settings`: whether the key is accepted, registration is on, new accounts confirm by code, and Google and Apple are on;
  - `GET /rest/v1/records?limit=1` without a sign-in: the tables exist when the answer is 200, 401 or 403, and are missing on `PGRST205`.
- **The list it shows:**
  - a check for what is in place;
  - a warning for what is missing (the key, the tables, registration);
  - information for the rest;
  - always a last line saying that the templates and SMTP cannot be checked from the app and are in the setup guide.
- **Errors:** a network error shows under the button.

## Checks

- **Node:** `tests/redesign-r42.test.js`, written first; it failed 7/7.
  - **What it covers:** every mapped answer, the PostgREST cases, `checkServer` against the extended fake server (`tables: false`), the Nalog list in every state, the app's check and the Serbian strings.
  - **Old tests updated:** the V2.0-a client test expects the translated sentences, and R41's version test now reads "≥ 67".
- **Manual-pending:** "Proveri server" against the real project, and the real sign-up, sign-in and sync after the user's Supabase steps.
