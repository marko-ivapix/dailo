# Dailo Release Roadmap — Beta to Mobile App and Sync

**Date:** 2026-10-07
**Baseline:** V1.8 on `main` (`29d1774`), served by GitHub Pages at `https://marko-ivapix.github.io/dailo/` (repository made public for Pages).
**Status:** Roadmap agreed with the user. Each version below still needs its own versioned spec and plan before implementation (AGENTS.md / WORKING_RULES.md).

## Decisions (user, 2026-10-07)

| Topic | Decision |
| --- | --- |
| Audience | Small beta group (friends/colleagues) |
| Sync | Automatic multi-device sync is wanted, delivered as **V2.0** |
| Sync timing | The database is connected **together with the mobile app** (V2.0), not before; until then Dailo stays local-first |
| Order | Beta starts **before** sync, on the local-first build |
| Sync backend | **Supabase** (auth, Postgres, storage; works from a static site) |
| Priorities before beta | Data protection, manual acceptance, then new features |
| Feature priorities | Task duration + time-blocking, smart Quick Add, weekly review |

## Where we are

- V1.3–V1.7 behavior and the V1.8 visual layer are implemented and covered by automated checks (288 Node tests at V1.8). Native-browser acceptance is still **manual-pending**: 126 historical items in `docs/codex/ACCEPTANCE.md` are unchecked and the V1.8 manual gate in `docs/superpowers/progress-v1-8.md` is open.
- First manual result (user, 2026-10-07): on the user's phone the Pages site loads and a new task persists after reload. Recorded later as iPhone, Safari tab (`docs/superpowers/progress-v1-8.md`).
- **V1.9 update (2026-10-07):** Phase 1 is implemented (V1.9 plan Steps 1–6) and merged into `main` through PR #5, with automated checks green: 330 Node tests, 329 passed, 1 todo, the release gate for the problem-report address. Evidence: `docs/superpowers/progress-v1-9.md`.
- **V1.9.1 update (2026-10-08):** Phase 1 is done. V1.9.1 sets the problem-report address the user supplied, adds the Serbian tester guide `uputstvo.html` (linked from Settings → About) and the beta checklist `docs/beta/provera-pre-bete.md`, and is packaged as `Dailo-v1.9.1-distributable.zip`. Automated checks: 335 Node tests, 335 passed, 0 todo. The user reported B1–B5 (install, layout, airplane mode, persistent storage, ZIP export/import) as passed on iPhone; B6–B24 are open. V1.9.1 was merged into `main` through PR #6 (`3597343`).
- **V1.10 update (2026-10-08):** Phase 4 started. V1.10 Smart Quick Add (`1.10.0`, `c64bd81`) is committed on branch `ccr-95f6062b-lgg2fr`. Automated checks: 348 Node tests, 348 passed, 0 todo (`docs/superpowers/progress-v1-10.md`). Not packaged on its own.
- **V1.11 update (2026-10-08):** V1.11 Weekly review (`1.11.0`, `5bbd820`): a `#review` page with six steps (Inbox, overdue and missed plans, next 7 days, Goals, Habits, Areas), a Today notice on the last three days of the week and a review log in `settings.weeklyReviews`. Automated checks: 357 Node tests, 357 passed, 0 todo (`docs/superpowers/progress-v1-11.md`).
- **V1.12 update (2026-10-08):** Phase 4 is done. V1.12 Duration and time-blocking (`1.12.0`, `d00855b`): Calendar "Dan" view with a capacity bar, a "Bez vremena" list with time inputs and drag, and an hour grid; daily capacity on Today and in Settings; a Quick Add "Trajanje" chip. Automated checks: 367 Node tests, 367 passed, 0 failed, 0 todo (`docs/superpowers/progress-v1-12.md`). V1.10–V1.12 were merged into `main` together through PR #7 (`31fb23d`) and are packaged as `Dailo-v1.12-distributable.zip` (V1.9.1 becomes the previous artifact). The beta checklist has B25–B30 for the new features. Use on iPhone and Mac is **manual-pending**.
- Release risks found while planning:
  1. **Data loss on iOS Safari.** WebKit deletes script-writable storage (localStorage, IndexedDB) for sites not opened for 7 days unless the site is added to the Home Screen. Dailo has no web app manifest and never calls `navigator.storage.persist()`.
  2. **Offline gaps.** Geist, Space Grotesk and Phosphor icons load from CDNs; there is no service worker, so the app does not open offline and icons disappear without network.
  3. **Reminders** fire only while the app is open (no service worker, no push).
  4. **Insecure-context IDs.** `crypto.randomUUID()` is unavailable outside HTTPS/localhost (e.g. a LAN IP). Item IDs come from `uid()` (`Math.random`) and work everywhere; only editing a recurring series "this and future" (`js/core.js:374`) fails there. Pages is HTTPS, so this is low priority (corrected while writing the V1.9 spec).
  5. **No feedback channel** for beta users and no visible app version.
  6. **Pages serves the whole repository**, including docs, tests and release ZIPs. Acceptable for a public repo, optional to narrow.

## Phase 1 — V1.9 "Beta-ready" (local-first, no backend) — done (V1.9.1, 2026-10-08)

Goal: beta users can install Dailo, use it offline and not lose data.

- [x] Web app manifest, icons (192/512 + `apple-touch-icon`), standalone display → installable to the Home Screen (also removes the iOS 7-day eviction for installed apps).
- [x] Request persistent storage with `navigator.storage.persist()` and show the result in Settings → Data.
- [x] Backup reminder: record the last successful ZIP export and offer a one-tap export after a configurable number of days (default 7).
- [x] Self-host fonts and icons (check OFL/MIT licenses) and add a service worker that caches the app shell for offline start.
- [x] Fallback ID generator when `crypto.randomUUID` is unavailable.
- [x] "Report a problem" entry (GitHub issue template or form) and app version in Settings. V1.9 chose an e-mail (`mailto:`) report; the address the user supplied is set in V1.9.1, so the link is visible.
- [ ] Optional: deploy only runtime files to Pages through a GitHub Actions workflow. Not part of V1.9; the service worker does not intercept docs or release ZIPs.
- [x] Added by the V1.9 spec: Serbian (`sr-Latn`) UI with Serbian Quick Add keywords, and fixes G1–G3.

Constraints: no Search change, no bulk actions, delete/Undo and typed RESET/RESTORE unchanged. Any new persisted field (e.g. last-export date) needs a normalization/migration test and backup round-trip coverage.

## Phase 2 — Manual acceptance (together with the user)

- [x] Define a **beta gate** subset of `ACCEPTANCE.md` + the V1.8 gate: install/offline, reload persistence, task create/edit/complete/delete + Undo, Today/Inbox/Calendar, Habit check-in, Goal progress, ZIP export/import/restore/reset, phone touch targets and navigation. Defined in V1.9.1 as `docs/beta/provera-pre-bete.md` (Serbian, B1–B24).
- [ ] Run it on the user's phone and Mac browser; record each item with device/browser in the progress ledger. B1–B5 passed on iPhone (2026-10-08); B6 (update notice; V1.9.1 has been on `main` since PR #6, and V1.12.0 follows after the Phase 4 PR is merged) is next; B6–B30 are open (B25–B30, added with V1.12, cover the V1.10–V1.12 features).
- [ ] Fix blocking findings as V1.9.x patches (failing test first).

## Phase 3 — Beta launch

- [x] Short onboarding page: install to Home Screen, data lives on the device, export backups regularly, known limitations (single device until V2, reminders only while open). Done in V1.9.1: `uputstvo.html` (Serbian), `https://marko-ivapix.github.io/dailo/uputstvo.html`, linked from Settings → About; it opens only online.
- [ ] Invite 5–10 people; triage feedback weekly and re-rank Phase 4.
- [x] Open question: UI language for beta. Resolved in V1.9: Serbian Latin only, with Serbian Quick Add keywords.

## Phase 4 — Features (V1.10+, alongside the beta) — done (V1.10–V1.12, 2026-10-08; merged through PR #7)

Each item gets its own spec; existing behavior was checked in source on 2026-10-07. Order and version numbers requested by the user on 2026-10-08: **V1.10 Smart Quick Add**, **V1.11 Weekly review**, **V1.12 Duration + time-blocking**.

- [x] **Smart Quick Add (V1.10).** Before: `parseQuickPlanPhrase` (English `today`/`tomorrow`/weekday, `HH:MM`), `#tag`, `!priority`; V1.9 added Serbian day/time keywords. Done in V1.10 (spec `docs/superpowers/specs/2026-10-08-todo-v1-10-design.md`, ledger `docs/superpowers/progress-v1-10.md`): `Core.parseQuickAdd` with due-date syntax (`rok petak`, `do petka`, `due friday`), duration (`45min`, `1h`, `1,5h`, `2 sata`), `+project`/`@area`, relative and calendar dates (`prekosutra`, `za 3 dana`, `in 2 weeks`, `15.10.`), Serbian priorities and live preview pills under the title. Voice input stays out of scope: iOS keyboard dictation already types into the title field. Merged into `main` with V1.11 and V1.12 through PR #7; iPhone use is manual-pending (B25).
- [x] **Weekly review (V1.11).** Before: Today "Daily review" stats card. Done in V1.11 (spec `docs/superpowers/specs/2026-10-08-todo-v1-11-design.md`, ledger `docs/superpowers/progress-v1-11.md`): `#review` page (`js/review-ui.js`) with six numbered steps — Inbox, overdue and missed plans, next 7 days, Goals with health, Habits with streak and completion, Areas with open tasks — using the existing row actions; "Završi nedeljni pregled" records the week in `settings.weeklyReviews` (validated on backup import); a Today notice on the last three days of the week; sidebar PROGRESS and "Još" entries. Pending merge; iPhone and Mac use is manual-pending (B27).
- [x] **Duration + time-blocking (V1.12).** Before: `durationMinutes`, same-day planned-time blocks and overlap detection (`js/core.js`); since V1.10 Quick Add reads durations (`45min`, `1h30`). Done in V1.12 (spec `docs/superpowers/specs/2026-10-08-todo-v1-12-design.md`, ledger `docs/superpowers/progress-v1-12.md`): Calendar "Dan" view with a capacity bar, a "Bez vremena" list (native time inputs, drag) and an hour grid on the existing drag/drop (conflict, estimated and completed blocks); daily capacity (`settings.dailyCapacityMinutes`, default 6 h) in Settings and on Today; a Quick Add "Trajanje" chip. The week stays a list (no multi-day grid). Packaged as `Dailo-v1.12-distributable.zip`, which closes Phase 4. Pending merge; drag, time inputs and capacity on iPhone and Mac are manual-pending (B26, B28–B30).

## Phase 5 — V2.0 Mobile app + Supabase sync

The mobile app and the database ship together (user decision, 2026-10-07). Wrapping the web app (e.g. Capacitor, same codebase) gives the app its own storage, so browser data does not carry over on its own; sync is therefore also the migration path from the web/PWA build into the app. A native app also removes the iOS Safari 7-day storage eviction and enables real notifications when the app is closed. Store accounts are needed: Apple Developer Program (USD 99/year) and Google Play (USD 25 one-time).

Requires an approved V2.0 spec that explicitly amends the "No backend, accounts or cloud sync" rule in `AGENTS.md`.

**Draft (2026-10-08):** `docs/superpowers/specs/2026-10-08-todo-v2-0-design.md`, status **DRAFT — not approved**. It proposes a Capacitor wrapper around the existing web app, optional Supabase sign-in by e-mail magic link, a generic `records` table with Row Level Security, local-first outbox sync with last-write-wins per record, an EU (Frankfurt) project and three sub-phases (V2.0-a web sync, V2.0-b Capacitor shell, V2.0-c store release). It awaits the user's six decisions (platforms, sign-in method, conflict policy, attachments in sync, app name and bundle id, privacy-page hosting) and what only the user can provide: a Supabase EU project, Apple Developer membership (and Google Play Console for Android), signing on the user's Mac, and approval of the privacy text. Until it is approved, the `AGENTS.md` no-backend rule still applies.

Spec must decide:
- [ ] Mobile packaging: Capacitor wrapper vs. alternatives; native storage for local data; native notifications; store listing and review requirements.
- [ ] Auth (Supabase Auth, e-mail magic link) and Row Level Security per user.
- [ ] Data mapping for canonical entities, Habit logs, Goal history and attachments (Supabase Storage); tombstones for deletes.
- [ ] Sync model: the local store stays the UI source of truth; background push/pull with an offline queue; conflict policy (per-entity last-write-wins on `updatedAt` as a starting point).
- [ ] First sign-in migration of existing local data; ZIP backup stays available.
- [ ] Privacy note, account/data deletion, and free-tier limits (free projects pause after inactivity).

## Next step

Phase 1 is done (V1.9.1, on `main` since PR #6), and Phase 4 is done (V1.10–V1.12, packaged as `Dailo-v1.12-distributable.zip`, merged into `main` through PR #7). Phase 2 and Phase 3 remain user actions: the beta gate (`docs/beta/provera-pre-bete.md`, B6–B30) on the user's iPhone and Mac, and inviting testers; fixes ship as patches with a failing test first. Next for Phase 5: the V2.0 spec draft (`docs/superpowers/specs/2026-10-08-todo-v2-0-design.md`) needs the user's decisions and accounts before approval; it amends the no-backend rule only once the user approves it.
