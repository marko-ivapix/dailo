# Security review — 2026-10-12

**Status:** findings 2, 3, 4, 6 and 8 are fixed in R58, and 5 and 9 in part (the widget token and the question before the first merge are left, with reasons) (`2.0.0-alpha.85`, `docs/superpowers/specs/2026-10-12-r58-security-fixes.md`); finding 1 waits for a custom domain and finding 7 is accepted for testing. · **Scope:** the user's checklist (keys, RLS, IDOR and user isolation, git secrets, storage buckets, input validation, injection, logs, auth sessions, dependencies, "attack your own app"), read-only, at `0c44289` (alpha.83) plus R57.

A read-only review agent did the review. The findings marked "confirmed" were then checked in the source by hand.

## Findings

| # | Severity | Finding | Where | Status |
| --- | --- | --- | --- | --- |
| 1 | Medium | The web app shares its origin `marko-ivapix.github.io` with every other GitHub Pages site of the account. A script on any of them (or an XSS there) could read `localStorage`, which holds the sync refresh token (`dailoSync`) and the raw journal key (`dailoJournalKey`). | `js/release.js` (site URLs), `js/app.js` (device-local keys) | Confirmed by design. Fix: a custom domain (for example `dailo.ivapix.cloud`) with the Supabase Site URL and redirects updated. Until then, enable Pages on no other repository of the account. |
| 2 | Medium-low | A journal entry can stay readable on the server after encryption is on. `syncOnce` pushes before it pulls, so a device that has not yet pulled `settings.journalCipher` pushes its edit unsealed. Unlocked devices accept unsealed rows and store their hash in the shadow, so they never re-seal them, and the history purge ran only once. | `js/sync.js` (journal pull and shadow update) | Confirmed in the code path; not yet reproduced in a test. Fix: do not record the shadow hash of an unsealed journal row while a key is present (the next round re-seals it), then purge the history again. Optionally, a server trigger refuses unsealed journal rows once the account has a cipher. |
| 3 | Low | HTML injection through a goal's unit: the progress sheet interpolates `goal.unit` without `esc()`. The CSP stops scripts, but markup (for example a refresh redirect) can still be injected through an imported backup or template. | `js/goals-ui.js` (`const unit = goal.unit ? ...`) | Confirmed. Fix: `esc(goal.unit)`. |
| 4 | Low | Supabase Realtime does not apply RLS to DELETE events, so any signed-in account subscribed to `records` without a filter receives the primary key (`user_id`, `type`, `id`) of other accounts' hard deletes (`delete_my_account()`, the `auth.users` cascade). | `supabase/migrations/0004_realtime.sql`, `js/sync.js` (the client-side filter) | Per the Supabase documentation; confirm against the current docs. Fix: publish an opaque per-user "poke" table instead of `records`, or use private Broadcast channels. |
| 5 | Low | Link injection: on the web, `?shortcut=` passes any target to `handleIncomingLink` (for example `auth?error=<text>`, shown escaped in the sign-in sheet, or `habit-done?id=…`). On Android the exported `MainActivity` accepts any `dailo://` link. | `js/app.js` (`consumeLaunchParams`), `MainActivity.java` | Confirmed. Fix: allow only `new-task`, `today` and `journal` in `?shortcut=`, accept `auth` only while a PKCE sign-in is pending, and give widget `habit-done` links a per-install token. |
| 6 | Low | Android backups (cloud, `adb backup` up to Android 11) include the WebView storage, with the refresh token and the journal key. | `android/app/src/main/AndroidManifest.xml` (`allowBackup="true"`) | Confirmed. Fix: `allowBackup="false"` or backup rules that leave out the WebView data. |
| 7 | Low | The committed debug key lets any APK signed with it install over a debug install and read its data. | `android/app/debug.keystore` | Known and intended for testing. Testers outside the team should get release-signed builds. |
| 8 | Low | No size cap on `records.data`, and `record_history` is never pruned (except the journal), while sign-up is open. Together they allow filling the database quota, and the history keeps deleted items' content. | `supabase/migrations/0001_sync.sql` | Fix: `check (pg_column_size(data) <= 262144)` and a scheduled prune of `record_history`; state the retention in the privacy policy. |
| 9 | Info | `purge_journal_history()` is revoked from `public` only. `anon` keeps EXECUTE through the Supabase defaults, which is harmless (no `auth.uid()`) but untidy. The CSP `connect-src` allows any `*.supabase.co`. The first sync into an empty account merges local data without asking (a shared device would carry the previous user's data over). The workflows pin actions by tag. | `0005_journal_history.sql`, `index.html`, `js/sync.js` | Fix: revoke from `anon` too, narrow `connect-src` to the project host, ask before the first merge. |

## Verified as fine

- **Secrets:** the working tree and all 312 commits contain only the publishable key and the intended debug keystore. There are no service-role keys, JWTs, private keys or provider tokens, and release keys come only from GitHub secrets.
- **RLS:**
  - `records` and `record_history` have RLS on, with `user_id = auth.uid()` in both `using` and `with check`, and `anon` revoked.
  - `record_history` has no write grants.
  - Storage policies are scoped to the user's own folder.
- **Isolation:** the primary key is `(user_id, type, id)`, the upsert touches only the caller's rows, a spoofed `user_id` fails `with check`, and nothing leaks whether a record exists.
- **SECURITY DEFINER functions:** they use `search_path = public` and `auth.uid()`, and fully qualify their tables.
- **Storage:** the bucket is private with a 10 MB limit. Pulled metadata is validated, and only images, PDF and plain text open inline.
- **Validation:**
  - Pulled state goes through `normalizeState` and the pruning of dangling links.
  - Colors are hex only, and links allow only http, https and mailto.
  - Backups have size, zip-bomb and domain checks.
  - Other interpolations use `esc()`.
- **Injection:** queries use `URLSearchParams` and JSON bodies, and storage paths are encoded.
- **Logs:** there is no logging of tokens, codes, keys or journal text.
- **Auth:**
  - Tokens are refreshed 60 s early, and a rejected token signs the device out.
  - Sign-out is local.
  - Google and Apple use PKCE S256, and the redirect is used only while a PKCE sign-in is pending.
- **Journal encryption:** PBKDF2-SHA-256 with 600,000 iterations, a random salt, AES-GCM-256 with a fresh IV per seal, and a locked device leaves the journal alone. The one exception is finding 2.
- **Dependencies:** `npm audit` reports 3 moderate issues in `uuid` through `xcode` inside `@capacitor/cli`. That is a build tool only and not shipped; the suggested "fix" is a downgrade.

## For the user's Supabase dashboard

- **Confirmations:** e-mail confirmation, secure e-mail change and secure password change are on.
- **Passwords and codes:** a minimum length of 8, leaked-password protection, OTP expiry of 15 minutes or less, and rate limits on sign-up, OTP and verify.
- **Sign-up:** CAPTCHA, since sign-up is open.
- **Redirect URLs:** exactly `https://marko-ivapix.github.io/dailo/` and `dailo://auth`, with no wildcards.
- **Tokens:** refresh-token rotation with reuse detection.
- **Server:**
  - migrations 0001–0005 applied and the Security Advisor clean;
  - only `record_pokes` in the Realtime publication (after 0006);
  - only the `public` schema in the Data API;
  - GraphQL off if unused.
