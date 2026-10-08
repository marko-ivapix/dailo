# Dailo V2.0 — Mobile app and Supabase sync

**Status:** **APPROVED 2026-10-08** ("da") with all six decisions answered (section "Decisions for the user"). Work starts with phase V2.0-a; the accounts (section "What the user provides") are needed for real use, not for writing and testing the code. V2.0-a is implemented (`docs/superpowers/progress-v2-0a.md`); sections D, E and decision 3 were aligned with it on 2026-10-08. V2.0-b (Capacitor shell, `docs/superpowers/progress-v2-0b.md`) is implemented too; real builds on the user's Mac and phones are pending.
**Baseline:** V1.12 (Phase 4 done).
**Roadmap:** `docs/superpowers/plans/2026-10-07-release-roadmap.md`, Phase 5. The user decided on 2026-10-07 that the mobile app and the database ship together.
**Rule change:** this approved spec amends `AGENTS.md` "No backend, accounts or cloud sync" for V2.0: optional Supabase sync is allowed as described here, and the app must keep working fully without an account. The service-role key never enters the repository. The project URL and the public anon key go into `js/sync-config.js` only when the user supplies them. The anon key is public by Supabase design; Row Level Security protects the data.

## Goal

The same Dailo on iPhone (installable from the App Store), Android and the web, with the user's data synced between devices. It stays local-first: the app works fully offline, and sync runs in the background.

Two problems that V1.x cannot solve go away:
- **Data on one device only:** V1.x moves data between devices only through ZIP.
- **Reminders only while open:** V1.x reminders work only while the app is open. A native app can schedule local notifications.

## Proposed design (recommendations)

### A. Packaging: Capacitor around the existing web app

- **Wrapper:** Capacitor wraps the current static app (same HTML/CSS/JS, no rewrite) in iOS and Android projects (`ios/`, `android/`). A rewrite in React Native or Swift would throw away V1.3–V1.12 and its test suite.
- **Storage:** the app keeps `localStorage` + IndexedDB inside the native web view. That storage lives in the app sandbox, which removes the Safari 7-day eviction. Capacitor Preferences or SQLite are not needed in V2.0.
- **Native plugins:**
  - Local Notifications, for task and habit reminders when the app is closed;
  - Share/Filesystem, for ZIP export;
  - App, for resume events that trigger a sync.
- **Web build:** the PWA on GitHub Pages stays and gets the same sync after sign-in.

### B. Accounts: Supabase Auth, e-mail without a password (decided 2026-10-08)

- **When:** sign-in arrives only with V2.0, together with the app and sync (user decision 2026-10-08). The V1.x web app gets no sign-in.
- **Sign-in:** optional. Without signing in, Dailo behaves exactly as V1.12 (local only).
- **Method:** the user types an e-mail address and enters a 6-digit one-time code sent to that address (Supabase e-mail OTP). There is no password.
  - **Code, not link:** on iPhone a link in the e-mail opens Safari, not the installed app, so a code typed into the app is more reliable.
  - **Session:** it stays on the device until the user signs out, so the code is needed only once per device.
  - **Not an option:** remembering the address without verifying it. Anyone who typed someone else's address would get that person's data.
  - **Sign in with Apple:** not required by App Store rules when the app offers no third-party social login.
- **Account deletion:** required by the App Store. It deletes the account and all its rows and files, from Settings.

### C. Data mapping (Postgres + Row Level Security)

- **Records table:** one generic table keeps the client model unchanged:
  - `records(user_id uuid, type text, id text, data jsonb, deleted boolean, updated_at timestamptz, primary key (user_id, type, id))`;
  - `type` is one of: tasks, projects, tags, areas, goals, habits, notes, resources, templates, savedViews, settings, habitLogs.
- **What syncs:**
  - **Collections:** each record of the local state collections. `ui` is device-local and never syncs.
  - **Settings:** they are one record (`settings/settings`) without the device-local keys `backupStatus` and `compactDensity`.
  - **Habit logs:** one record each (`habitLogs/<id>`).
  - **Goal history:** it stays on the device in V2.0 and syncs in V2.1, together with attachments.
- **Attachments:** not synced in V2.0 (decision 4); they stay on the device where they were added.
  - Their `attachmentIds` field is not sent, and a pulled record keeps the local device's `attachmentIds`.
  - V2.1 moves the files to Supabase Storage (`attachments/<user_id>/<id>`).
- **Row Level Security:** on every table, `user_id = auth.uid()`.
- **Server clock:** a trigger sets `updated_at = clock_timestamp()` on every insert and update.
- **History:** a second trigger copies the replaced row into `record_history`, so a version that lost a conflict can be recovered on the server.
- **Deletes:** they become tombstones (`deleted = true`, `data = null`), so other devices learn about them.
- **Account deletion:** `delete_my_account()` is a `security definer` function. It removes the user's rows, history and auth user.

### D. Sync model

- **Local store first:** the local store stays the UI source of truth. Nothing in the save path changes.
- **Change detection:** a device-local shadow (`dailoSync` in `localStorage`, never in backups) stores a hash of every record as last synced. A sync compares the current local records with the shadow: changed and new records are upserted, and missing records become tombstones. No per-save outbox is needed.
- **Order:** every sync pushes first and then pulls the records changed since the last server cursor. Pulling uses a 5-second overlap, and identical records are skipped, so late commits are not missed.
- **When:** on start, on resume, a few seconds after a local save, every five minutes, when the device comes back online, and on "Sinhronizuj sada".
- **Conflicts:** last write wins per record (decision 3). The push that reaches the server last wins. The replaced version is kept in `record_history` on the server.
- **Applying pulls:** a pull is applied only when no dialog is open and no global operation runs; otherwise it waits for the next sync. Pulled state is normalized and saved through the existing save path, and habit logs are written through `TodoStorage`. A pulled habit log for a habit and date that already has a different local log replaces it.
- **Status and safety:** Settings shows sync status (account, last sync, errors). The ZIP backup, Undo and recovery snapshots stay available.

### E. First sign-in and migration

- **Choice on a non-empty account:** at the first sign-in on a device that already has local data and an account that already has data, the user picks one: "Spoji" (merge: a record on both sides keeps its newer `updatedAt`, otherwise this device's version), "Zadrži podatke sa naloga" or "Zadrži podatke sa ovog uređaja". "Otkaži i odjavi se" leaves both sides unchanged.
- **Safety snapshot:** a local automatic snapshot is always taken first, outside the usual five-minute pause; if it fails, the sync does not start.
- **Moving from the PWA:** this is also how a user moves from the PWA or Safari to the App Store app: sign in on both.

### F. Privacy and compliance

- **Region:** the Supabase project is in the EU (Frankfurt).
- **Privacy policy:** a page in Serbian (e.g. `privatnost.html`) and its URL are required by the App Store and Play. It covers what is stored, where, deletion and contact. No analytics or tracking SDKs.
- **Store listings:** they declare "data linked to the user: user content, e-mail".
- **Export:** a full data export (ZIP) works signed in or not.

### G. Costs

- **Supabase:**
  - **Free tier:** free projects pause after a week of inactivity, which is acceptable for a beta.
  - **Pro:** about USD 25 per month for a real launch.
- **Store accounts:** Apple Developer Program costs USD 99 per year, and Google Play USD 25 once.
- **Builds:** iOS builds need a Mac with Xcode. The user has a Mac. CI builds are optional later.

## Phases (after approval)

1. **V2.0-a, sync in the web app:**
   - schema and Row Level Security migrations (SQL files in `supabase/`);
   - `js/sync.js` (shadow diff, push, pull, conflicts) with Node tests against a fake server;
   - optional sign-in in Settings.
   - The beta testers try it on the PWA first.
2. **V2.0-b, Capacitor shell** (implemented 2026-10-08: Capacitor 8 with Swift Package Manager; plugins Local Notifications, App, Filesystem and Share; ZIP export through the share sheet; `tools/build-www.mjs`):
   - `ios/` and `android/` projects, icons and splash, local notifications for reminders;
   - the same `www` built from the repository with no bundler (copy step only).
3. **V2.0-c, store release:** privacy page, store texts in Serbian, TestFlight beta, App Store review, Play internal testing.

Each phase gets its plan, failing tests first, and a ledger, as V1.x did.

## Decisions for the user

1. **Platforms.** **Decided 2026-10-08:** iPhone and Android together (TestFlight and Play internal testing in parallel).
2. ~~**Sign-in method.**~~ **Decided 2026-10-08:** e-mail without a password (one-time code), and only with V2.0.
3. **Conflict policy.** **Decided 2026-10-08:** last-write-wins per record. The replaced version is kept on the server in `record_history`; local recovery snapshots stay available on each device.
4. **Attachments.** **Decided 2026-10-08:** sync records first; attachments follow in V2.1.
5. **App name and identifier.** **Decided 2026-10-08:** "Dailo", bundle/application id `cloud.ivapix.dailo`.
6. **Privacy page.** **Decided 2026-10-08:** it is written and published later, before the store release (phase V2.0-c); it is not needed for V2.0-a and V2.0-b.

## What the user provides (I cannot create these)

- **Supabase:** a project in the EU region; for local work, its URL and anon key as environment secrets, never committed. The service-role key is never used in the app.
- **Apple Developer Program** membership (and Google Play Console for Android).
- **Signing:** signing and the App Store Connect app record, done on the user's Mac with Xcode. I can prepare the projects and step-by-step instructions.
- **Privacy policy:** approval of the privacy policy text, which I draft.

## Out of scope for V2.0

- Sharing or collaboration between users.
- A web dashboard other than the app.
- Calendar sync (Google/Apple).
- AI features.
- Paid plans.
