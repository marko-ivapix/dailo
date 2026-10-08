# Dailo V2.0 — Mobile app and Supabase sync (DRAFT)

**Status:** **DRAFT — decisions recorded 2026-10-08, not yet approved.** All six decisions are answered (section "Decisions for the user"). Before any code is written it still needs the user's explicit approval to start and the accounts (section "What the user provides").
**Baseline:** V1.12 (Phase 4 done).
**Roadmap:** `docs/superpowers/plans/2026-10-07-release-roadmap.md`, Phase 5. The user decided on 2026-10-07 that the mobile app and the database ship together.
**Rule change:** this spec, once approved, amends `AGENTS.md` "No backend, accounts or cloud sync" for V2.0 only. Until then that rule stands, and no backend code, keys or accounts are added to the repository.

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
  - `records(id text, user_id uuid, type text, data jsonb, updated_at timestamptz, deleted_at timestamptz, primary key (user_id, type, id))`;
  - `type` is one of: tasks, projects, areas, tags, goals, habits, notes, resources, templates, savedViews, cleaning, settings.
- **History tables:** `habit_logs(...)` and `goal_history(...)` mirror the IndexedDB stores.
- **Attachments:** not synced in V2.0 (decision 4); they stay on the device where they were added. V2.1 moves the files to Supabase Storage (`attachments/<user_id>/<id>`), and their metadata travels with the owner record.
- **Row Level Security:** on every table, `user_id = auth.uid()`.
- **Deletes:** they become tombstones (`deleted_at`), so other devices learn about them; tombstones are purged after 90 days.

### D. Sync model

- **Local store first:** the local store stays the UI source of truth. Every saved change is queued (outbox) with the record's `updatedAt`.
- **Push:** outbox records are upserted when the app is online, on start, on resume and every few minutes.
- **Pull:** records changed since the last server cursor are fetched; the cursor is `updated_at` from the server clock.
- **Conflicts:** last write wins per record on the server `updated_at`. The losing version is kept in the existing local recovery snapshots, so nothing is lost silently. The spec review must accept this policy (see decisions).
- **Status and safety:** Settings shows sync status (last sync, pending changes, errors). The ZIP backup stays available, and so do Undo and recovery snapshots.

### E. First sign-in and migration

- **Choice on a non-empty account:** at the first sign-in on a device that already has local data and an account that already has data, the user picks one: "Spoji" (merge, last write wins), "Zadrži podatke sa servera" or "Zadrži podatke sa ovog uređaja".
- **Safety snapshot:** a safety snapshot is taken first, as for ZIP import.
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
   - `js/sync.js` (outbox, push, pull, conflicts) with Node tests against a fake client;
   - optional sign-in in Settings.
   - The beta testers try it on the PWA first.
2. **V2.0-b, Capacitor shell:**
   - `ios/` and `android/` projects, icons and splash, local notifications for reminders;
   - the same `www` built from the repository with no bundler (copy step only).
3. **V2.0-c, store release:** privacy page, store texts in Serbian, TestFlight beta, App Store review, Play internal testing.

Each phase gets its plan, failing tests first, and a ledger, as V1.x did.

## Decisions for the user

1. **Platforms.** **Decided 2026-10-08:** iPhone and Android together (TestFlight and Play internal testing in parallel).
2. ~~**Sign-in method.**~~ **Decided 2026-10-08:** e-mail without a password (one-time code), and only with V2.0.
3. **Conflict policy.** **Decided 2026-10-08:** last-write-wins per record, with the losing version kept in recovery snapshots.
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
