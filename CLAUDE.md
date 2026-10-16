# Dailo — Claude project guide

This file is the entry point for Claude and other coding agents. It holds what every session needs. The full step-by-step history (V1.7 to R57) is in `docs/claude/HISTORY.md`, and newer steps are in the ledgers listed below.

## Communicating with the user

Always reply to the user **in Serbian and briefly**: say what it is or what was done, and how it was done. No long reports or exhaustive lists unless the user asks.

Code, file names, commands and repository documentation keep their existing language. Repository docs are English. These are Serbian:
- `PROJECT_OVERVIEW.md`;
- the beta material: `docs/beta/` and `uputstvo.html`;
- the user guides in `docs/v2/`;
- the public pages `privatnost.html`, `uslovi.html` and `404.html`.

## The project

Dailo is a local-first personal productivity app. It covers tasks, projects, Inbox, a calendar, habits, goals, areas, notes, resources, a journal, templates and a weekly review, in the flow **Capture → Organize → Plan → Complete**.

- **No build step:** it is static HTML, CSS and vanilla JavaScript, with no bundler. `npm run build` only copies the precached shell into `www/`.
- **Storage:** `localStorage` holds compact metadata. IndexedDB holds attachments, habit logs, goal history and recovery snapshots.
- **Language:** the UI is Serbian (`sr-Latn`) only.
- **Web:** it installs and starts offline as a PWA (`manifest.webmanifest`, `sw.js`). GitHub Pages serves `main` at `https://marko-ivapix.github.io/dailo/`.
- **Phone apps:** the same files run in a Capacitor 8 app for Android and iPhone (`cloud.ivapix.dailo`; `android/`, `ios/`). `js/platform.js` is the only code that knows whether it runs on the web or natively.
- **Sync (optional):**
  - It uses Supabase (`js/sync.js`, `supabase/migrations/0001`–`0006`).
  - Sign-in is by e-mail and password, Google or Apple.
  - Changes arrive in real time, and the journal can be encrypted.
  - Without an account everything stays on the device.
- **Desktop:** a layer for screens from 1024 px wide (sidebar, dialogs, popovers).

## Branches and pull requests

- `main` is the default branch and is what GitHub Pages serves.
- Cloud sessions develop on the branch the session names (so far `ccr-95f6062b-lgg2fr`) and push with `git push -u origin <branch>`. If the session pushes to a different branch, tell the user its exact name.
- Open a pull request only when the user asks. Merge with a merge commit titled `Merge PR #N: Rx–Ry (version)`.
- After a merge:
  - restart the work branch from `origin/main` (`git checkout -B <branch> origin/main`, then a force-with-lease push);
  - record the merge in the ledger and under **Current state** below;
  - check the Pages run through the Actions API. The cloud proxy blocks `github.io`.
- `feature/todo-v1-3` is historical.

## Read first

1. `AGENTS.md`: the non-negotiable product and engineering rules (V1.3–V1.7, still in force).
2. `docs/claude/`:
   - `CONTINUATION.md`, `PROJECT_MAP.md`, `ARCHITECTURE.md`, `DOMAIN_MODEL.md` and `FEATURES.md`;
   - `DATA_AND_RECOVERY.md`, `TESTING_AND_RELEASE.md` and `WORKING_RULES.md`, which holds the i18n rules.

   They were last synchronized at older versions, so the current source and tests win.
3. **Ledgers (newest rows at the bottom):**
   - `docs/superpowers/progress-redesign.md`: R1–R57 and every later step, with its commit, checks and what is manual-pending;
   - `progress-modernization.md`: M1–M12;
   - `progress-v2-0a.md`: sync;
   - `progress-v1-*.md`: the earlier versions.
4. **Specs and plans:** `docs/superpowers/specs/` has one spec per step. Data-model specs are marked as such. Plans are in `docs/superpowers/plans/`.
5. **For the user (Serbian):**
   - `docs/beta/provera-pre-bete.md`: the beta checklist B1–B42;
   - the guides `docs/v2/podesavanje-supabase.md`, `capacitor-mac.md`, `android-izdanje.md` and `ios-widgeti.md`.

## Source-of-truth rule

For implemented behavior, inspect the current source and tests first. Specs say what was approved; source and tests say what is built. If a summary conflicts with the source, do not guess silently: record the discrepancy and treat the source plus its tests as the facts.

## Commands

```bash
npm ci                 # jsdom for the smoke test, Capacitor for the native projects
npm run verify         # syntax of every JS file + the Node suite
npm run smoke          # boots index.html in jsdom and walks the main flows
npm run check:python   # Python AST, path adapter, regression registry, static contracts
npm run check:links    # internal links; add --external (node tools/check-links.mjs --external) where the network allows
npm run build          # copies the precached shell into www/
npm run cap:sync       # build + npx cap sync (iOS and Android projects)
python3 -m http.server 8080
```

- **Without `npm ci`:** `node --test "tests/*.test.js"` and `node tools/check-syntax.mjs` still work.
- **Cloud sessions:**
  - `.venv/` does not exist; use `python3`.
  - The outside network is mostly blocked, so outside links are checked by `.github/workflows/links.yml`.
  - CI (`.github/workflows/ci.yml`) runs the same checks and builds the debug APK on every push.
  - The Android APK recipe is the `android-apk` skill.
- **Browsers:** do not launch Chromium or touch the user's Chrome unless the user asks for that browser action.

## Rules that are easy to break

- **Every step follows the `release-step` skill:**
  - a failing test first;
  - a spec in `docs/superpowers/specs/`;
  - the version in `js/release.js`, `sw.js`, `package.json` and `package-lock.json`. Only the newest release test pins the exact version; older ones say "or later";
  - a ledger row with the commit hash.
- **Data model:**
  - A data-model change gets its own data-model spec.
  - Schema V3, IndexedDB v2 and ZIP `backupVersion: 2` stay. IndexedDB v2 (R103) added the `archivedTasks` store; archived tasks still travel in a ZIP's `data.tasks`.
  - Device-local keys (see below) stay outside state and backups.
- **i18n:** English source strings are the translation keys. Serbian goes into `js/i18n-sr.js`, Latin script only. `msg()` marks keys that are translated later. Node tests stay English.
- **Product:**
  - no bulk-selection UI;
  - global Search ranking and scope unchanged;
  - deletion is confirmation → delete → Undo;
  - Reset and Restore need a recovery snapshot and the typed words RESETUJ / VRATI. Restore always makes a safety ZIP; Reset makes one unless the user turns off "Sačuvaj kopiju pre brisanja" (R107, on by default), and then also deletes the local snapshots and the phone's automatic backups.
- **CSS:**
  - Colors and sizes are `:root` tokens.
  - New rules go before `/* Keep primary compact actions touchable after all density rules. */`.
  - Every class the markup uses must be styled (`tests/design-v1-8.test.js`), and dead selectors are not allowed (`tests/redesign-r34.test.js`).
- **Code shape:**
  - Screens are domain modules (`window.TodoDomainModules.register`, `domainContext()`).
  - Code leaving `js/app.js` follows `docs/superpowers/plans/2026-10-12-app-js-modules.md`.
  - Tests find moved functions through `tests/support/source.js`.
- **`REPORT_EMAIL`** in `js/release.js` is the address the user supplied. Never change it to one the user has not given.
- **Secrets never enter the repository:**
  - the Supabase service-role key;
  - provider secrets;
  - the release upload key (`DAILO_UPLOAD_*` comes only from GitHub secrets).

  `js/sync-config.js` holds only the project URL and the publishable key. `android/app/debug.keystore` (password `android`) is the intentional shared debug key.
- **Manual checks are never reported as passed** unless the user reports them. This covers phones, iPhone and Mac builds, visual checks, real Supabase sign-ins and the beta checklist. Record the user's words as given.
- **No model identifiers** go into commits, PR titles or bodies, code or docs.

## Current state

*Update this section on every merge.*

- **`main`:** `99c1e9e` (PR #32: R83–R106 from `ccr-95f6062b-lgg2fr`); GitHub Pages serves `2.0.0-alpha.135` (see the ledger row for the runs). The work branch `ccr-95f6062b-lgg2fr` was restarted from it.
  - From the user's list ("sve odradi osim ciljeva"; projects and areas stay as they are, "Ostaje kao sada"; the bulk moves as an AGENTS.md exception; the archive at the end):
    - R83–R84: Danas — past-due tasks and Zatvori dan, one by one or all to tomorrow;
    - R85 (data model): habit durations in the day's capacity; R106: a Trajanje row in Detalji navike;
    - R86–R90: Inbox without type filters, Kad radim / Rok, "Od dana završetka" (R88, data model), Quick Add reads spoken times, repeats and Cyrillic, suggests #/+/@ and takes pasted lists;
    - R91–R93: Kalendar 3 dana; Navike with 30-day success, a note on the day and limits (R93, data model);
    - R94–R97: project status and next step (data model), the Redovne obaveze bar, a 10-minute weekly review, note links to projects and goals (data model);
    - R98–R102: the journal asks about the day, ready-made templates and views (R100, data model), the completed summary, search without diacritics and across scripts, a Ctrl/Cmd+K palette;
    - R103 (data model): old completed tasks in IndexedDB v2 `archivedTasks`; R103b: fixes from its review.
  - R104–R105: fixes from read-only code reviews of R83–R102 and a security review of the branch (among them, sync had stopped applying pulls with notes older than R97).
  - Before: PR #31 (`970617b`, R72–R82): Još → Planiranje, Česta pitanja, the guide, the outside-review fixes R75–R82, Šta je novo.
  - Before: PR #30 (`707f169`, R67–R71), PR #29 (`286bb97`, R66), PR #28 (`83d49d1`, R65), PR #27 (`fbcffc7`, R59–R64).
- **Sync:** `js/sync-config.js` holds the user's project `https://qjfpnvjuqbrmdkjxxmsq.supabase.co` and its publishable key (`docs/v2/podesavanje-supabase.md`).
  - **Checked on 2026-10-13 with the publishable key (read-only):**
    - the tables of 0001 exist, and 0005 and 0006 were run;
    - e-mail sign-up is on, with Confirm email;
    - the Site URL is the app and `dailo://auth` is an allowed redirect;
    - Google and Apple are off.
  - **SMTP:** reported working by the user ("radi smtp sada"). The first try with the own mail server failed with `535 authentication failed`. Later: "Nalog i eposta sve je okej".
  - **Not visible with the key:** migrations 0002–0004, the e-mail templates, the minimum password length and the region.
  - The cloud environment allows `qjfpnvjuqbrmdkjxxmsq.supabase.co`.
- **Reported by the user:**
  - iPhone B1–B5 (2026-10-08);
  - Android debug APKs `2.0.0-alpha.41`, `.53`, `.54`, `.65` and `.85` installed and working ("instalirao sam, sve radi"; alpha.85 on 2026-10-12, built from `main` at `6a85a58`);
  - notifications arrive (alpha.41);
  - on 2026-10-13, on the web: R59 "da"; R61 "imaju 3 stanja" (the jumping order fixed in R66); R62 and R63 "mislim da je okej"; R65 "okej"; account and e-mail (Serbian e-mails with the code, links, password length, region, SMTP) "Nalog i eposta sve je okej".

  The `2.0.0-alpha.83` debug APK was also sent on 2026-10-12; no separate report came for it. The `2.0.0-alpha.98` debug APK was sent on 2026-10-13, built from `claude/sleepy-gauss-7u6n19` at `af8ba56`; on 2026-10-14 the user reported "Radi", and about R66 "Navike stoje na mestu, sve je okej". The `2.0.0-alpha.135` debug APK was sent on 2026-10-16, built from `ccr-95f6062b-lgg2fr` at `0029e97` (`main` `99c1e9e` plus the beta checklist update); on 2026-10-16 the user reported "instalirao sam, sve radi" (no beta items named).
- **Manual-pending:**
  - **Beta checklist:** B6–B42.
  - **iPhone:** the build on the user's Mac, plus the widgets and share extension, which need a paid team (`docs/v2/ios-widgeti.md`).
  - **Android release:** the upload key, the GitHub secrets and Play Console (`docs/v2/android-izdanje.md`).
  - **Two devices:** real sign-ins and sync, realtime and the encrypted journal; since PR #32 also one device with archived tasks and one with notes made before R97, all on the same version (older versions drop day notes and "Od dana završetka").
  - **Phone (PR #32):** the IndexedDB v2 upgrade in the WebView and the archived-tasks mirror, dragging in the calendar, pasting into Quick Add, the habit duration row.
  - **Browser and visual checks:** the desktop layer in a wide window, the light theme, `.ics` in real calendar apps, dictation in Chrome and Safari, and the link preview in messengers.
- **Open review items:**
  - Security finding 1: the shared `github.io` origin waits for a custom domain (`docs/superpowers/specs/2026-10-12-security-review.md`).
  - A privacy-policy sentence about problem reports (version, device, up to five cleaned errors) waits for the user's approval (R82).
  - The privacy policy says the Supabase project runs in Frankfurt; asked with the region among the account items, the user answered "Nalog i eposta sve je okej" (2026-10-13).
  - The controller named in `privatnost.html` and `uslovi.html` is Marko Radičević, as the user gave it.
- **Device-local keys** (outside state and backups):
  - `dailoSync`, `dailoNotified`, `dailoNotifyAsked`, `dailoSample`, `dailoTransferDismissed`;
  - `dailoJournalLater`, `dailoPlannedFired`, `dailoJournalLock`, `dailoAutoBackup`, `dailoSampleNotice`;
  - `dailoGestureHint`, `dailoTextSize`, `dailoTheme`, `dailoWelcome`;
  - `dailoSidebar`, `dailoSidebarFolds`, `dailoJournalKey`, `dailoSeenVersion`, `dailoErrorLog`, `dailoCloseDayLater`.

## The `.claude/` folder

- **`settings.json`:**
  - shared permissions for the safe commands above;
  - a `SessionStart` hook (`.claude/hooks/session-start.sh`) that runs `npm ci` in cloud sessions;
  - a `PreToolUse` guard (`.claude/hooks/guard-bash.sh`) that blocks pushes to `main` and force pushes without a lease.
- **`rules/`:** short path-scoped rules. They load when Claude reads or edits matching files: app code, styles, tests, the server and sync, the native projects, and the Serbian public pages and guides.
- **`skills/`:** `release-step` (a new step from test to push), `android-apk` (build and send the debug APK) and `merge-pr` (PR, merge, branch reset, records).
- **`agents/`:** `security-auditor` and `code-reviewer` (read-only reviews against these rules).
- **Personal overrides:** `CLAUDE.local.md` and `.claude/settings.local.json`. Both are gitignored.
- **No `commands/` folder:** skills replace it, since both answer to `/name`.
- **No `.mcp.json`:** GitHub comes from the session's environment.
