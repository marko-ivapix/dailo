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

- V1.3–V1.7 behavior and the V1.8 visual layer are implemented and covered by automated checks (288 Node tests). Native-browser acceptance is still **manual-pending**: 126 historical items in `docs/codex/ACCEPTANCE.md` are unchecked and the V1.8 manual gate in `docs/superpowers/progress-v1-8.md` is open.
- First manual result (user, 2026-10-07): on the user's phone the Pages site loads and a new task persists after reload. Recorded later as iPhone, Safari tab (`docs/superpowers/progress-v1-8.md`).
- **V1.9 update (2026-10-07):** Phase 1 is implemented (V1.9 plan Steps 1–6) on branch `ccr-95f6062b-lgg2fr`, with automated checks green: 330 Node tests, 329 passed, 1 todo, the release gate for the problem-report address. Still open: the report address, `Dailo-v1.9-distributable.zip`, the PR into `main` and the manual iPhone pass. Evidence: `docs/superpowers/progress-v1-9.md`.
- Release risks found while planning:
  1. **Data loss on iOS Safari.** WebKit deletes script-writable storage (localStorage, IndexedDB) for sites not opened for 7 days unless the site is added to the Home Screen. Dailo has no web app manifest and never calls `navigator.storage.persist()`.
  2. **Offline gaps.** Geist, Space Grotesk and Phosphor icons load from CDNs; there is no service worker, so the app does not open offline and icons disappear without network.
  3. **Reminders** fire only while the app is open (no service worker, no push).
  4. **Insecure-context IDs.** `crypto.randomUUID()` is unavailable outside HTTPS/localhost (e.g. a LAN IP). Item IDs come from `uid()` (`Math.random`) and work everywhere; only editing a recurring series "this and future" (`js/core.js:374`) fails there. Pages is HTTPS, so this is low priority (corrected while writing the V1.9 spec).
  5. **No feedback channel** for beta users and no visible app version.
  6. **Pages serves the whole repository**, including docs, tests and release ZIPs. Acceptable for a public repo, optional to narrow.

## Phase 1 — V1.9 "Beta-ready" (local-first, no backend) — implemented, pending report address, package and merge

Goal: beta users can install Dailo, use it offline and not lose data.

- [x] Web app manifest, icons (192/512 + `apple-touch-icon`), standalone display → installable to the Home Screen (also removes the iOS 7-day eviction for installed apps).
- [x] Request persistent storage with `navigator.storage.persist()` and show the result in Settings → Data.
- [x] Backup reminder: record the last successful ZIP export and offer a one-tap export after a configurable number of days (default 7).
- [x] Self-host fonts and icons (check OFL/MIT licenses) and add a service worker that caches the app shell for offline start.
- [x] Fallback ID generator when `crypto.randomUUID` is unavailable.
- [x] "Report a problem" entry (GitHub issue template or form) and app version in Settings. V1.9 chose an e-mail (`mailto:`) report; the link stays hidden until the user supplies the address.
- [ ] Optional: deploy only runtime files to Pages through a GitHub Actions workflow. Not part of V1.9; the service worker does not intercept docs or release ZIPs.
- [x] Added by the V1.9 spec: Serbian (`sr-Latn`) UI with Serbian Quick Add keywords, and fixes G1–G3.

Constraints: no Search change, no bulk actions, delete/Undo and typed RESET/RESTORE unchanged. Any new persisted field (e.g. last-export date) needs a normalization/migration test and backup round-trip coverage.

## Phase 2 — Manual acceptance (together with the user)

- [ ] Define a **beta gate** subset of `ACCEPTANCE.md` + the V1.8 gate: install/offline, reload persistence, task create/edit/complete/delete + Undo, Today/Inbox/Calendar, Habit check-in, Goal progress, ZIP export/import/restore/reset, phone touch targets and navigation.
- [ ] Run it on the user's phone and Mac browser; record each item with device/browser in the progress ledger.
- [ ] Fix blocking findings as V1.9.x patches (failing test first).

## Phase 3 — Beta launch

- [ ] Short onboarding page: install to Home Screen, data lives on the device, export backups regularly, known limitations (single device until V2, reminders only while open).
- [ ] Invite 5–10 people; triage feedback weekly and re-rank Phase 4.
- [x] Open question: UI language for beta. Resolved in V1.9: Serbian Latin only, with Serbian Quick Add keywords.

## Phase 4 — Features (V1.10+, alongside the beta)

Each item gets its own spec; existing behavior was checked in source on 2026-10-07.

- [ ] **Duration + time-blocking.** Exists: `durationMinutes`, same-day planned-time blocks and overlap detection (`js/core.js`). Missing: duration entry in Quick Add, an hourly Day/Week grid (previously deferred), drag into time slots, daily capacity.
- [ ] **Smart Quick Add.** Exists: `parseQuickPlanPhrase` (English `today`/`tomorrow`/weekday, `HH:MM`), `#tag`, `!priority`. V1.9 added Serbian day/time keywords. Missing: due-date syntax, duration (`30m`, `1h`), project/Area syntax, relative dates, live preview chips; voice input to be investigated per browser.
- [ ] **Weekly review.** Exists: Today "Daily review" stats card. Missing: a guided weekly flow (Inbox to zero, overdue, next week, Goal progress, Habit stats, Area check) with a completion record.

## Phase 5 — V2.0 Mobile app + Supabase sync

The mobile app and the database ship together (user decision, 2026-10-07). Wrapping the web app (e.g. Capacitor, same codebase) gives the app its own storage, so browser data does not carry over on its own; sync is therefore also the migration path from the web/PWA build into the app. A native app also removes the iOS Safari 7-day storage eviction and enables real notifications when the app is closed. Store accounts are needed: Apple Developer Program (USD 99/year) and Google Play (USD 25 one-time).

Requires an approved V2.0 spec that explicitly amends the "No backend, accounts or cloud sync" rule in `AGENTS.md`.

Spec must decide:
- [ ] Mobile packaging: Capacitor wrapper vs. alternatives; native storage for local data; native notifications; store listing and review requirements.
- [ ] Auth (Supabase Auth, e-mail magic link) and Row Level Security per user.
- [ ] Data mapping for canonical entities, Habit logs, Goal history and attachments (Supabase Storage); tombstones for deletes.
- [ ] Sync model: the local store stays the UI source of truth; background push/pull with an offline queue; conflict policy (per-entity last-write-wins on `updatedAt` as a starting point).
- [ ] First sign-in migration of existing local data; ZIP backup stays available.
- [ ] Privacy note, account/data deletion, and free-tier limits (free projects pause after inactivity).

## Next step

V1.9 is implemented per `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md` and `docs/superpowers/plans/2026-10-07-todo-v1-9.md`. Finish its Step 7 (report address, package, PR into `main`, manual iPhone checklist), then start Phase 2.
