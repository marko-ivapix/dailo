# Dailo V2.0-a Progress Ledger — Sync in the web app

**Baseline:** V1.12 on `main` (`31fb23d`)
**Spec:** `docs/superpowers/specs/2026-10-08-todo-v2-0-design.md` (approved 2026-10-08)
**Plan:** `docs/superpowers/plans/2026-10-08-todo-v2-0a.md`

## Status

- [x] Step 1 — Server schema and setup guide (`65aeabf`)
- [x] Step 2 — Sync core `js/sync.js` with a fake Supabase (`65aeabf`)
- [x] Step 3 — App and Settings (`7a834db`)
- [x] Step 4 — Release `2.0.0-alpha.1`, docs and ledger
- [ ] User: Supabase project per `docs/v2/podesavanje-supabase.md`, then the project URL and public key for `js/sync-config.js` (pending)
- [ ] Manual: sign-in, two-device sync and account deletion on iPhone and Mac (manual-pending, possible only after the step above)

Until `js/sync-config.js` has the two values, sync is off: the Settings card is hidden and the app behaves as V1.12.

## Evidence

**Step 1 — server.**
- **`supabase/migrations/0001_sync.sql`:**
  - the `records` table, with primary key `(user_id, type, id)` and a `type` check list;
  - `record_history`;
  - the `touch_record` trigger (`updated_at = clock_timestamp()`) and the `keep_record_history` trigger;
  - Row Level Security with `user_id = auth.uid()`; no access for `anon`;
  - `delete_my_account()`: `security definer`, fixed `search_path`, execute granted only to `authenticated`.
- **`docs/v2/podesavanje-supabase.md`** is the Serbian setup guide:
  - EU project and running the SQL;
  - e-mail templates with `{{ .Token }}` and the site URL;
  - which two public values to send, and never the `service_role` key;
  - free-tier limits.
- **Static SQL checks** live in `tests/sync-v2-0a.test.js`.

**Step 2 — sync core.** `tests/sync-v2-0a.test.js` and `tests/support/fake-supabase.js` were written first. The fake provides e-mail OTP (code `123456`), refresh, logout, the records REST API with RLS by token, a server clock, history and account deletion.
- **Pure parts:**
  - `collectRecords` drops `attachmentIds`, the device settings (`backupStatus`, `compactDensity`) and `ui`;
  - `hashRecord` and `diffRecords`;
  - `applyRemote` keeps local attachments and device settings and applies tombstones. Same-day habit logs resolve to the greater id on every device.
- **Client:** `createClient` offers `requestCode`, `verifyCode`, `refresh`, `ensureSession`, `signOut`, `deleteAccount`, `push` (upsert in batches of 500) and `pull` (pages of 1000).
- **`syncOnce`** pushes, commits the shadow, then pulls with a 5-second overlap. It returns `ok`, `choose` or `error` and never throws.
- **First sync:**
  - `merge` keeps the newer `updatedAt` for a record on both sides; otherwise the device wins;
  - `server` replaces local data;
  - `device` replaces the account data;
  - `choose` is returned when both sides have data and no mode was given.
- **Expired sign-in:** a rejected refresh token is reported as `Session expired` (status 401).

**Step 3 — app and Settings.** `tests/sync-app-v2-0a.test.js` was written first (all integration tests failed before the change); it runs the app's sync block in a vm against the fake server.
- **Loading:** `js/sync-config.js` (empty and frozen) and `js/sync.js` load after `js/backup.js`, before the domain modules and the app, and are precached. A test rejects a `service_role` JWT or an `sb_secret_` key in the config.
- **Device-local record:** `localStorage` key `dailoSync` holds `{ userId, session, shadow, cursor, lastSyncAt, lastError }`. It is never in state or backups. Signing in again to the same account keeps the shadow; another account starts fresh.
- **Triggers:**
  - start, `visibilitychange` (visible), `online`;
  - 3 seconds after every successful `saveState`;
  - every 5 minutes, and "Sinhronizuj sada".
- **When it waits:** a sync waits 15 seconds while a dialog, Undo, a pending text save, a drag or a focused text field is active. It does not run during recovery, a global operation, start-up, a storage error or a stale-tab notice.
- **Applying pulls:**
  - pulled state is normalized and saved through `saveState`, and the previous state is restored if the save fails;
  - habit logs are written through `TodoStorage` (deletes first), then the metrics refresh and the screen renders;
  - a pull that meets an open dialog is deferred without moving the shadow.
- **First-sync dialog:** "Spoji", "Zadrži podatke sa naloga", "Zadrži podatke sa ovog uređaja", or "Otkaži i odjavi se". A forced automatic snapshot is taken first: `createAutomaticSnapshot(state, now, { force: true })` skips the five-minute pause. If the snapshot fails, the sync does not start.
- **Settings "Sinhronizacija" card**, shown only when configured:
  - e-mail → code (`inputmode="numeric"`, `autocomplete="one-time-code"`, Enter submits);
  - when signed in: account, last sync or "Sinhronizacija u toku…", a translated error, "Sinhronizuj sada", "Odjavi se", "Obriši nalog";
  - account deletion needs the typed word `OBRIŠI`, also accepted without diacritics;
  - the About privacy note follows the sync state.
- **Errors shown to the user:**
  - wrong code: "Kod nije tačan ili je istekao.";
  - HTTP 429: "Previše zahteva…";
  - network and server errors keep their translated prefix.
- **Fix:** a fired text save now clears `textSaveTimer`. Before, it stayed set and would have held sync back for good; the change is covered by a test.
- **Catalog and stubs:**
  - +40 catalog entries across Steps 2–3 (1502 in total);
  - CSS `.sync-actions`, `.sync-choice-option`;
  - test stubs `startSync() {}` (`tests/final-integration-v1-5.test.js`) and `scheduleSync() {}` (`tests/tasks-today-v1-5.test.js`); assertions are unchanged.

**Step 4 — release.**
- **Version:** `APP_VERSION` and `sw.js` `VERSION` are `2.0.0-alpha.1`. Only `tests/sync-app-v2-0a.test.js` pins the exact version.
- **Older release tests:** the V1.12 release test now requires 1.12 or later. The V1.9 release test accepts a pre-release suffix.
- **Guide and checklist:** `uputstvo.html` is unchanged while sync is off. Sync checks B31–B36 are added to `docs/beta/provera-pre-bete.md` for after the configuration.
- **Fix found in the docs review:** a full reset while signed in would have pushed tombstones for every record, deleting the account data on all devices. A committed full reset or ZIP restore now calls `forgetSyncShadow()`, which drops the shadow and cursor and keeps the session. The next sync is therefore a first sync: an empty device takes the account data, and data on both sides opens the choice. Covered by a new test (+1 in `tests/sync-app-v2-0a.test.js`).
- **No distributable ZIP** for the alpha. The next package comes with the configured sync; `Dailo-v1.12-distributable.zip` stays the current artifact.

Checks (Node v22.22.0, Python 3.13.16):
- full Node suite: **393 tests, 393 passed, 0 failed, 0 todo**, in 48 `tests/*.test.js` files (367 at V1.12; +12 in `tests/sync-v2-0a.test.js`, +14 in `tests/sync-app-v2-0a.test.js`);
- JavaScript syntax **75/75**;
- Python AST 19/19;
- static browser contracts 10/10;
- registry 3/3; path adapter 2/2;
- `git diff --check` passed.

Real sign-in, e-mail delivery, two-device sync, iPhone resume and account deletion are **manual-pending** until the Supabase project exists. Node checks against the fake server do not replace them.
