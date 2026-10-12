# R60 — the e-mail links lead to Dailo, and Serbian templates

**Date:** 2026-10-12 · **Status:** the user's report: "Treba da se zamene mailovi koji stižu za potvrdu mailova, restorane lozinke itd. Kada se klikne na link vodi na localhost". · **Release:** `2.0.0-alpha.87`.

## Cause

The account e-mails (sign-up confirmation, new password, new address) came with Supabase's default English templates. Their link goes to the project's **Site URL**, which a new project sets to `http://localhost:3000`.

- **Unchanged dashboard:** the setup guide (steps 2 and 3 of `docs/v2/podesavanje-supabase.md`) already asked for Serbian templates with the code and the right Site URL. Those settings live in the user's Supabase dashboard, which this repository cannot change.
- **The app's part:** the app never told Supabase where the links should go, so Supabase always fell back to the Site URL.

## The change

- **Where the links go:**
  - `DailoSync.createClient` takes `emailRedirect`, and the app passes `Release.APP_URL` (`https://marko-ivapix.github.io/dailo/`).
  - Sign-up, a new confirmation code, a new password and a new address send `?redirect_to=` with it.
  - Supabase follows it when the address is on the project's Redirect URLs list (guide step 3). Otherwise it still uses the Site URL, so the guide now says that a localhost link means the Site URL was left as is.
- **The landing:**
  - **Reading it:** `DailoSync.authLanding(text)` reads only the outcome from the address. A link that lands carries `#access_token=…&type=signup|invite|magiclink|email_change|recovery`; a failed one carries `#error…` or `?error…`, and `otp_expired` means the link expired.
  - **At start:** `consumeAuthLanding()` runs before the welcome screen. It removes the result from the address (`history.replaceState`, so no token stays in the address bar or history) and shows a Serbian message:
    - "E-adresa je potvrđena. Prijavi se svojom lozinkom." — the welcome screen opens on Prijava when the device is not signed in;
    - "Nova e-adresa je potvrđena.";
    - "Za novu lozinku upiši kod iz e-poruke: Prijava → Zaboravljena lozinka?";
    - "Link je istekao ili je već iskorišćen. Zatraži novi kod u Dailu.";
    - "Link nije uspeo. Zatraži novi kod u Dailu."
  - **Security:** the session in the address is never used. A link someone else sends cannot sign this device into their account, and the device's data cannot end up there.
  - **Google and Apple:** their `?error…` keeps going to the R40 sign-in flow while that sign-in is pending.
- **The templates:**
  - **Files:** `supabase/templates/confirm-signup.html`, `reset-password.html`, `change-email.html` and `reauthentication.html` are Serbian, with inline styles only.
  - **Content:**
    - each starts with its Subject on the first line;
    - the Dailo name, a title, the large `{{ .Token }}` code, and where in the app to type it;
    - a note that the code expires, and "Ako ovaj zahtev nije poslat sa tvog uređaja, zanemari ovu poruku.";
    - only the sign-up template also has a "Potvrdi nalog" button (`{{ .ConfirmationURL }}`).
  - **The guide:** step 2 has a table of template, file and subject, and keeps the short versions.

## Checks

- **Node:** `tests/emails-r60.test.js`, written first; it failed 5/5. It covers:
  - `redirect_to` on the four requests against the fake server, and none without the option;
  - the landing outcomes, and addresses that are not landings;
  - that the landing never touches the session;
  - the Serbian messages;
  - the templates and the guide;
  - the version.
- **Older tests updated:** `tests/sync-app-v2-0a.test.js` (the client options) and `tests/plus-r59.test.js` (the version is now "or later").
- **Manual-pending (the user's Supabase dashboard):**
  - set the Site URL to `https://marko-ivapix.github.io/dailo/` and check the Redirect URLs;
  - paste the four templates;
  - then confirm a new account, ask for a new password, and open an old (expired) link.
