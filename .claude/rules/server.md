---
paths:
  - "supabase/**"
  - "js/sync.js"
  - "js/sync-config.js"
---
# Server and sync (supabase/, js/sync.js)

- **Migrations:**
  - Migrations are append-only: a change is a new `supabase/migrations/000N_<topic>.sql`, written idempotently (`if not exists`, `create or replace`).
  - The user applies them in the Supabase SQL editor, so `docs/v2/podesavanje-supabase.md` names each new one.
- **Tables:** every table has RLS on, with `user_id = auth.uid()` in both `using` and `with check`, and `anon` revoked.
- **SECURITY DEFINER functions:** they set `search_path = public`, use `auth.uid()` (never a user id parameter), and revoke EXECUTE from `public` and `anon`.
- **Keys:** `js/sync-config.js` holds only the project URL and the publishable key. The service-role key never enters the repository.
- **Tests:** sync logic is tested against `tests/support/fake-supabase.js`. A real sign-in and two-device checks are the user's to report.
- **The journal:** when `settings.journalCipher` is set, journal rows leave the device only sealed.
- **Open findings:** `docs/superpowers/specs/2026-10-12-security-review.md`.
