# Dailo — HTML Prototype v2.0-alpha

Desktop-first, local-first functional prototype for a personal/freelancer task tracker. The product keeps a simple workflow:

**Capture → Organize → Plan → Complete**

`plannedDate` means when you intend to work on a task. `dueDate` is its deadline. A task exists once; Today, Inbox, Upcoming, Anytime, Projects, Tags and Completed are derived views over the same task data.

## Run

This is a static HTML/CSS/vanilla JavaScript prototype. Serve the folder with a small local web server:

```bash
# run from this repository root
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

For checks and the iPhone/Android app (Node 22 or newer):

```bash
npm ci              # exact versions from package-lock.json
npm run verify      # JavaScript syntax + the Node suite
npm run smoke       # boots index.html in jsdom: create a task, Back, reopen
npm run cap:sync    # copies the shell into www/ and syncs the iOS and Android projects
npm run cap:ios     # opens Xcode (macOS)
npm run cap:android # opens Android Studio
```

The step-by-step Serbian guide for the Mac, iPhone and Android phone is `docs/v2/capacitor-mac.md`.

- The service worker registers only on `https:` or `localhost`/`127.0.0.1`. On a plain-HTTP LAN address the app still works, without offline caching.
- Shell files are served cache-first until `sw.js` changes. While developing on localhost, bypass or unregister the worker in the browser's developer tools to see edited files.
- GitHub Pages serves the repository over HTTPS at `https://marko-ivapix.github.io/dailo/`. All paths and the manifest/service-worker scope are relative (`./`), so install and offline start work under the `/dailo/` sub-path; the user confirmed both on iPhone from this URL on 2026-10-08. Pages publishes `main`, which carries V1.9.1 since PR #6; V1.10, V1.11 and V1.12 are there since PR #7; V2.0-a, the Capacitor app and `2.0.0-alpha.3` since PR #8 (2026-10-09).
- The Serbian beta tester guide is at `https://marko-ivapix.github.io/dailo/uputstvo.html` (also linked from Settings → About). It is not precached, so it opens only online.

## 2.0.0-alpha.3 — Capacitor app and modernization (current release)

The same app now also runs as a native app for iPhone and Android through Capacitor 8 (`cloud.ivapix.dailo`), after a technical audit (`docs/superpowers/specs/2026-10-09-modernization-capacitor-audit.md`) and ten phases (`docs/superpowers/plans/2026-10-09-modernization-capacitor.md`, evidence in `docs/superpowers/progress-modernization.md`). Merged into `main` through PR #8 (`6b5166f`, 2026-10-09).

- **In the app:** reminders as phone notifications even when Dailo is closed; backups and attachments through the system share sheet; links open outside the app; Android Back closes sheets and dialogs; a durable copy of the metadata in the app's files; a first-run notice to import a backup from the web version or sign in.
- **Everywhere:** sync never deletes record types it does not know and no longer stops on links to records deleted elsewhere; completion and history days are local days; only images, PDF and plain text open inline; snooze choices never land in the past; popovers survive the on-screen keyboard; 16 px fields and 44 px targets on touch screens; the toast sits above the bottom navigation; icon-only buttons have names; a Content Security Policy.
- **Tooling:** `package.json` with exact versions, `npm run verify`, a jsdom smoke test, `npm run build` (copies the precached shell into `www/`; no bundler).
- **Your decisions (M11, `2.0.0-alpha.3`):** a habit's weekly target or the week start changes only from the change on; no habit reminder after the day's check-in; Search waits 120 ms after typing and shows at most 50 tasks and 20 projects.
- **Checks:** 490 Node tests passed, syntax 93/93, smoke OK, `cap sync` OK. Native compile, simulators/emulators and phones are **manual-pending**: the cloud session has no macOS and no Android SDK.

## V2.0-a Sync in the web app

Version `2.0.0-alpha.1`. Optional sync between devices through Supabase, with sign-in by a one-time code sent by e-mail (no password). **It is off in this build:** until the Supabase project exists and its URL and public key are in `js/sync-config.js`, the Settings card is hidden and Dailo works exactly as V1.12.

- **Settings → Sinhronizacija** (only when configured):
  - type an e-mail address, get a code, type the code;
  - afterwards the card shows the account, the last sync and errors, with "Sinhronizuj sada", "Odjavi se" and "Obriši nalog" (typed `OBRIŠI`; data on the device stays).
- **What syncs:** tasks, projects, tags, Areas, goals, habits and their logs, notes, resources, templates, saved views and the shared settings.
  - **Stays on the device:** attachments (V2.1), goal history (V2.1), the UI state, the backup status and the density setting.
- **When:** at start, when the app comes back to the screen or online, a few seconds after a change, every five minutes, and on demand.
  - **Waiting:** a sync waits while a dialog, Undo, a drag or typing is in progress.
  - **Conflicts:** the last write wins per record, and the server keeps the replaced version in `record_history`.
- **First sign-in on a device that already has data:** if the account also has data, a dialog offers "Spoji" (the newer change wins), "Zadrži podatke sa naloga" or "Zadrži podatke sa ovog uređaja". A local recovery copy is made first.
- **Safety:**
  - a full reset or ZIP restore makes the next sync start fresh instead of deleting data on the server;
  - the ZIP backup, Undo and local snapshots work as before.
- **Server:**
  - `supabase/migrations/0001_sync.sql`: one `records` table with Row Level Security, server time, history and account deletion;
  - setup steps for the owner: `docs/v2/podesavanje-supabase.md` (Serbian);
  - the `service_role` key never enters the repository.

Spec: `docs/superpowers/specs/2026-10-08-todo-v2-0-design.md` (approved 2026-10-08). Plan: `docs/superpowers/plans/2026-10-08-todo-v2-0a.md`. Evidence: `docs/superpowers/progress-v2-0a.md` (393 Node tests, 393 passed, against an in-memory fake Supabase). Real sign-in and two-device sync are **manual-pending** (beta checklist B31–B36) until the Supabase project exists. There is no ZIP for the alpha; next come V2.0-b (iPhone and Android app with Capacitor) and V2.0-c (store release).

## V1.12 Duration and time-blocking

Version `1.12.0`. A day can be seen as a schedule: what is planned at which hour, what still has no time, and whether the planned work fits into the day.

- **Calendar → Dan.** The Calendar switch is now "Dan" / "Nedelja" / "Mesec". The day view moves one day with the arrows ("Prethodni dan" / "Sledeći dan"), and "Danas" jumps back. Hiding Tasks in the Calendar visibility row also hides them here.
- **Hour grid.** One row per hour (06:00–23:00, starting earlier when a task starts before 06:00). Timed tasks are blocks placed by start and length that open the task on click and show their time range. Overlapping open tasks get a warning border (`has-conflict`); a task without a duration is drawn as an estimated 30-minute dashed block (nothing is saved); done tasks are dimmed. On desktop, drag a task onto an hour to plan it for that day and hour (the existing Calendar drag/drop).
- **"Bez vremena".** Open tasks planned for the day without a time are listed above the grid. Each has a native time input: choose a time and it moves into the grid. On desktop the rows can also be dragged onto an hour.
- **Daily capacity.** Settings → General → "Dnevni kapacitet" (Isključeno / 2 / 4 / 5 / 6 / 7 / 8 / 10 / 12 h, default 6 h) sets how much planned work fits into a day. When at least one open task planned for the day has a duration, the day view shows "Planirano {planned} od {capacity}" with a bar, and Today's summary strip shows e.g. "2 h 30 min / 6 h". Both warn when the day is over capacity.
- **"Trajanje" chip.** Quick Add has a duration chip with 15 / 30 / 45 / 60 / 90 / 120 min presets and "Ukloni trajanje". A chosen value wins over a duration typed in the title (`45min`).
- **Empty day.** "Nema planiranih zadataka za ovaj dan." with a "Dodaj zadatak" button that opens Quick Add for that date.
- The beta guide `uputstvo.html` has a "Raspored dana" section. Out of scope: a multi-day hour grid (the week stays a list), resizing blocks by dragging, habits or goals on the grid, automatic scheduling and external calendars.

Spec: `docs/superpowers/specs/2026-10-08-todo-v1-12-design.md`. Plan: `docs/superpowers/plans/2026-10-08-todo-v1-12.md`. Evidence: `docs/superpowers/progress-v1-12.md` (367 Node tests, 367 passed, 0 failed, 0 todo). No schema change: `settings.dailyCapacityMinutes` is an optional integer 0–1440, validated on backup import. Drag, native time inputs, the grid layout and capacity on a real iPhone and Mac are **manual-pending** (beta checklist B26, B28–B30).

## V1.11 Weekly review

Version `1.11.0`. Once a week, one guided page walks through everything that drifts and ends with a recorded "review done".

- **Where.** "Nedeljni pregled" in the sidebar PROGRESS group and in the phone "Još" menu (route `#review`). On the last three days of the week (Friday–Sunday for Monday weeks), Today shows a quiet notice "Vreme je za nedeljni pregled" with "Započni pregled" until this week's review is done. It is never a modal.
- **Six steps**, each with the existing row actions or links and a one-line note when there is nothing to do:
  1. "Isprazni Inbox": Inbox tasks with the Inbox quick actions;
  2. "Kasni i propušteno": overdue tasks, then missed plans, with the overdue quick actions;
  3. "Sledećih 7 dana": planned and due counts per day, plus "Otvori Predstojeće";
  4. "Ciljevi": active goals with progress and health;
  5. "Navike": active habits with the current streak and completion rate;
  6. "Oblasti": Areas with their open-task count.
- **Finishing.** "Završi nedeljni pregled" records the week and shows "Pregled za ovu nedelju je završen {date}." with up to four previous reviews. The log (`settings.weeklyReviews`) keeps at most 26 weeks and is validated on backup import; there is no schema change.
- The beta guide `uputstvo.html` has a "Nedeljni pregled" section. Out of scope: a step-by-step wizard with per-step saving, notes per review, charts and notifications when the app is closed.

Spec: `docs/superpowers/specs/2026-10-08-todo-v1-11-design.md`. Plan: `docs/superpowers/plans/2026-10-08-todo-v1-11.md`. Evidence: `docs/superpowers/progress-v1-11.md` (357 Node tests, 357 passed). Using the review on a real iPhone and Mac is **manual-pending** (beta checklist B27).

## V1.10 Smart Quick Add

Version `1.10.0`. One Quick Add line can describe the whole task, in Serbian or English, and Dailo shows what it recognized before you save. For example:

```text
Pošalji ponudu +Klijenti #posao !visok rok petak 45min sutra u 9:30
```

This saves "Pošalji ponudu" in the project Klijenti, with the tag `posao`, high priority, due Friday, 45 minutes, planned for tomorrow at 09:30.

- **Trailing clauses** are read from the end of the title, in any order, one of each kind:
  - plan date: `danas`/`today`, `sutra`/`tomorrow`, `prekosutra`, weekdays (`u sredu`, `friday`), `za 3 dana`, `za 2 nedelje`, `in 3 days`, `in 2 weeks`, `15.10.`, `15.10.2026.`, `2026-10-15`. Today's weekday means next week; a date without a year means its next occurrence;
  - time: `u 9:30`, `at 09:30`, `9:30`;
  - due date: `rok petak`, `do petka` (weekday in the genitive), `do sutra`, `do 15.10.`, `due friday`;
  - duration: `45min`, `45 min`, `45m`, `1h`, `1,5h`, `1h30`, `1h30m`, `1h 30min`, `2 sata` (1–1440 minutes).
- **Tokens anywhere:** `#tag`, `!high`/`!medium`/`!low` or `!visok`/`!srednji`/`!nizak`, `+project`, `@area`. Projects and Areas match existing, non-archived names loosely (case, spaces, `_`, `-` and diacritics are ignored), so `+kucni_projekat` finds "Kućni projekat". Unknown tokens stay in the title, and nothing is created. The first priority token wins (V1.5 took the last). A project wins over an Area.
- **What stays as written:** parsing stops at the first ordinary word, and at least one word always remains as the title. An invalid clause (`25:00`, `31.02.`, `0min`) leaves the trailing part unchanged. `do 17:00` and a weekday after `za` (`za nedelju`) are not parsed; V1.9 parsed the latter.
- **Pickers win.** A plan date, time, due date, duration, project or Area chosen in the Quick Add pickers beats the parsed value; with an explicit plan date, plan-date words stay in the title. A parsed project or plan date files the task outside the Inbox.
- **Live preview.** Pills under the title ("Prepoznato u naslovu") list the recognized plan date and time, due date, duration, project or Area, tags and priority, and update on every keystroke. Nothing is shown when nothing is recognized.
- The beta guide `uputstvo.html` lists the new syntax. Voice input stays out of scope: iOS keyboard dictation already types into the title field.

Spec: `docs/superpowers/specs/2026-10-08-todo-v1-10-design.md`. Plan: `docs/superpowers/plans/2026-10-08-todo-v1-10.md`. Evidence: `docs/superpowers/progress-v1-10.md` (348 Node tests, 348 passed). V1.10 was merged into `main` together with V1.11 and V1.12 through PR #7. V1.10 has no ZIP of its own; it is in `Dailo-v1.12-distributable.zip`. Typing the new syntax and the preview on a real iPhone are **manual-pending** (beta checklist B25).

## V1.9 beta-ready (V1.9.1)

Local-first build for a small Serbian-speaking beta on iPhone Safari. V1.x has no backend, account or sync; the optional sync arrives with V2.0 (V2.0-a above).

- **Install to the iPhone Home Screen.** In Safari tap Share → Add to Home Screen → Add. Settings → General shows these steps, or confirms that Dailo is installed. Safari and the installed app keep separate data: install first, then use; move existing Safari data with ZIP export and import.
- **Offline start.** Geist, Space Grotesk and Phosphor icons are vendored with their licenses (`vendor/fonts/`, `vendor/phosphor/`); no CDN is used. `sw.js` precaches the app shell in a versioned cache. Docs, downloads and other requests go to the network.
- **Update prompt.** A new version waits until you tap Refresh in the "new version available" notice. The page never reloads by itself.
- **Persistent storage.** Dailo asks the browser to keep its data (`navigator.storage.persist()`) after the first tap in a session, or from Settings → Data → Persistent storage, which also shows the status and usage.
- **Backup reminder.** When the last ZIP export is older than the interval (default 7 days), Today shows one notice with Export backup and Remind me tomorrow (24-hour snooze). Without any export, it counts from the oldest record; an empty workspace gets no reminder. The interval (Off / 3 / 7 / 14 / 30 days) is in Settings → Data.
- **Serbian interface (`sr-Latn`).** Every screen, dialog, toast, Undo message, recovery screen and the Search modal's labels are Serbian. Dates and numbers use `sr-Latn-RS`. Search behavior is unchanged, and the typed confirmations stay `RESET` and `RESTORE`.
- **Serbian Quick Add.** Trailing `danas`, `sutra` and weekdays (`ponedeljak` … `nedelja`, with or without diacritics, optionally after `u`, e.g. `u sredu`) set the plan date; `u 9:30` sets the time. English keywords keep working. V1.10 extends this syntax (above).
- **Version and problem report.** The version (`1.9.1` in that release, `1.12.0` now) appears in Settings → About and the brand tooltip; the backup manifest records `releaseVersion`. "Report a problem" opens an e-mail to the beta address `marko.radicevic@ivapix.cloud` (configured in V1.9.1) with the version and device details only, never app data.
- **Beta tester guide and checklist (V1.9.1).** Settings → About → "Beta tester guide" opens `uputstvo.html`, a short Serbian page: install on iPhone, data on the device, backups, Quick Add, offline use and the update notice, limitations and how to report a problem. `docs/beta/provera-pre-bete.md` is the Serbian beta checklist (B1–B24, plus B25–B30 for the V1.10–V1.12 features since V1.12 and B31–B36 for the sync once it is configured) to run before inviting testers.
- **Fixes.** V1.9.1 translates two remaining English fallbacks: the live Quick Add plan chip and the Settings → Data "Validation" line after an import or reset. The favorite star icon renders again (G1); a stored week start of `0` now behaves as Sunday everywhere (G2); the stale disabled "Week starts on" row is gone from Settings → General (G3). `Core.makeUuid()` falls back to `crypto.getRandomValues` or `Math.random` where `crypto.randomUUID` is unavailable, such as plain-HTTP LAN addresses.

Spec: `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md`. Plan: `docs/superpowers/plans/2026-10-07-todo-v1-9.md`. Evidence: `docs/superpowers/progress-v1-9.md`. The user reported install, standalone layout, airplane-mode launch, the Serbian UI and Quick Add, the favorite star, persistent storage and ZIP export/import as working on iPhone (2026-10-08). The update notice, the problem-report e-mail, the backup reminder notice (only 7 days after an export) and the rest of the beta checklist are **manual-pending**.

## V1.6 highlights

- Task duration, a three-task Today Focus queue, inline completion/planning and Daily Review.
- Trailing Quick Add date/time phrases with explicit field values taking precedence.
- Goal health and linked contributions; Habit minimum/ideal targets, grace-day recovery and rolling weekly/monthly insights. Numeric Habit targets can be fractional; weekly check-in targets remain whole counts.
- Calendar task blocks use planned time plus duration and mark overlaps without introducing another event store.
- Resource type, reading status, author and review date; separate Note/Resource clips, favorites and local filters.
- Template variables/scheduled Task creation and Today section personalization.
- Cleaning workspace with room Projects (`isCleaningRoom`) and ordinary chore Tasks, including room presets and recurring maintenance examples.
- Responsive navigation parity: the compact circular Quick Add menu is available in mobile, tablet and desktop previews, while narrow screens also expose persistent bottom navigation for Today, Inbox, Calendar, Goals and Habits.
- Inbox triage supports All / Tasks / Goals / Habits / Notes / Resources filters, captured-item grouping and non-destructive removal from Inbox.
- Bounded local snapshots and selective recovery, described below. State schema remains V3 and earlier ZIP formats remain importable.

## V1.7 stabilization highlights

- Mobile `More` navigation keeps every route reachable while preserving the five primary destinations and Quick Add.
- Accessibility hardening adds named dialogs, predictable focus return, semantic Area tabs and touch-safe primary controls.
- Regression evidence now enumerates V1.1, V1.2, V1.3, V1.5 and V1.6 browser-scenario groups, while V1.7 release checks cover the Node/static safety and integration suites separately.
- Data safety covers reciprocal Goal-link repair, timestamp/ID validation, bounded ZIP/snapshot work and stale-tab protection.
- Targeted responsive polish keeps mobile filters, Notes/Resources/Areas lists and Calendar Day Detail compact without a broad redesign.
- Global Search behavior and the no-bulk-actions constraint remain unchanged.

## V1.8 visual redesign — Quiet Graphite / Swiss Compact

- Presentation-only release on top of V1.7 behavior: no schema, Search, recovery, entity or navigation-meaning change and no new dependency.
- Graphite neutrals with hairline structure instead of stacked filled cards; tighter 4/6/8/12px radii; overlay-only shadows; no blur or glow.
- Space Grotesk page titles, card headings and numerals; Geist for everything operational; tabular counts and dates.
- Electric-blue primary actions, a lighter on-dark blue for focus/active navigation, mint completion, yellow warning, red danger/overdue — contrast pairs are recorded in the V1.8 spec.
- Sidebar back to the 240px/72px brand geometry with an accent active marker; opaque bottom bar with an active indicator; bottom-anchored More sheet; rounded-square 44px Quick Add.
- Segmented controls for Inbox filters, Calendar Week/Month and Template types; underline Area tabs; Calendar type rails (tasks blue, habits mint, goals neutral, milestones yellow).
- Visible two-step focus ring (inset inside clipped/scrolling containers), `prefers-contrast: more` and forced-colors support, motion-safe loading indicator, quieter empty states and opaque error band. Phone touch targets stay at 44px.

Spec: `docs/superpowers/specs/2026-10-07-todo-v1-8-design.md`. Plan: `docs/superpowers/plans/2026-10-07-todo-v1-8.md`. Evidence: `docs/superpowers/progress-v1-8.md`. V1.8 visual, responsive, touch, keyboard and assistive-technology acceptance in a native browser is **manual-pending**.

The V2.0-a, V1.12, V1.11 and V1.10 evidence ledgers are `docs/superpowers/progress-v2-0a.md`, `docs/superpowers/progress-v1-12.md`, `progress-v1-11.md` and `progress-v1-10.md`; the V1.9 ledger `docs/superpowers/progress-v1-9.md` also holds the user's iPhone results; the V1.7 release ledger is `docs/superpowers/progress-v1-7.md`. Native browser acceptance is **manual-pending** unless that ledger explicitly records a user-owned-browser run; static checks and Node tests do not imply visual or browser acceptance.

For Claude Code continuation, start with `CLAUDE.md` and `docs/claude/CONTINUATION.md`. Historical versioned specs remain traceability documents; current source and focused tests are the factual implementation baseline.

Scheduled Task templates are one-shot per configured date. They run after saving a due schedule, during ready startup, and on the open app's 30-second checks. Missed dates catch up once when the app is next ready; variables and relative dates use the scheduled day, not the catch-up day. They do not run while the app is closed. Failed saves remain eligible for retry without duplicate Tasks. Saving a different schedule date creates a new one-shot schedule.

Today keeps its heading/date above personalized cards. Pinned cards appear first; Up/Down reorders within the pinned or unpinned group. Task/Project templates preserve Task duration, and Habit templates preserve minimum/ideal targets and grace days without execution history.

### Local snapshots and selective recovery

After successful saves, Dailo attempts an automatic snapshot after one idle second, at most once every five minutes. Startup also schedules a capture. It retains the five latest automatic copies, including normalized metadata, files, Habit logs and Goal history. Copies for interrupted operations are retained separately. These copies share the browser's storage quota and are not a substitute for an exported ZIP.

Use **Settings → Data → Local snapshots** to choose one entity from a saved version. Its record and owned files/history replace that entity's current version; unrelated records remain current. Task, Project and Habit restores also reconcile their reciprocal Goal links while preserving other Goal fields and contributions. Restoring a Goal reconciles its membership on existing Tasks, Projects and Habits without replacing their other fields or Goal links. Missing or incompatible saved contribution settings stop the restore. Linked entities must already exist: missing dependencies stop the restore and must be recovered separately. Restoring an Area or Project does not implicitly restore its children.

Each selective restore downloads a safety ZIP, creates an internal recovery copy, and requires typing **RESTORE**. The same source checks, write verification and rollback used by full restore protect selective replacement. Snackbar Undo is available briefly while data remains unchanged after restore. If later edits make Undo unsafe, the operation refuses to overwrite them and retains its safety copy for another selective recovery. Full ZIP restore and Reset retain their existing typed **RESTORE**/**RESET** safeguards.

Storage failures distinguish unsaved changes from an automatic snapshot failure and offer Retry. Reduced-motion preference suppresses animation/transition delays and reduces durations.

### Verification status

The latest verification is recorded in `docs/superpowers/progress-v2-0a.md` (V2.0-a: 393 Node tests, 393 passed, 0 failed, 0 todo; JavaScript syntax 75/75); V1.12 (367 tests) is in `docs/superpowers/progress-v1-12.md`, V1.11 (357 tests) and V1.10 (348 tests) are in their own ledgers, and the V1.9.1 record (335 tests) is in `docs/superpowers/progress-v1-9.md`. The release package is `Dailo-v1.12-distributable.zip` with a `.sha256` sidecar (recipe in `docs/claude/TESTING_AND_RELEASE.md`); it carries V1.10–V1.12 and closes roadmap Phase 4. `Dailo-v1.9.1-distributable.zip` is the previous package. V1.7 release evidence stays in `docs/superpowers/progress-v1-7.md`. Both distinguish automated evidence from the **manual-pending** user-owned-browser and iPhone gate; no isolated Chromium or personal Chrome is opened by the implementation workflow.

## V1.4 foundation

V1.4 keeps the V1.3 data model and adds a faster daily-planning flow:

- Today and Upcoming surface overdue work, scheduled Habits, active Goals and dated Milestones with quick move/snooze actions.
- Task Properties expose Important, Urgent and Focus controls while preserving planned/due dates, reminders, recurrence, links and attachments.
- Calendar Week/Month/Day Detail share the same state as Tasks, Goals and Habits, including planned/due times and same-time conflict hints.
- Goal detail shows linked work and milestone progress; the Habit dashboard supports month navigation, historical check-ins, streaks and trend summaries.
- Notes and Resources stay separate and support Areas, tags, relationships and attachments.
- Mobile controls use larger touch targets, a compact Quick Add flow, keyboard-safe focus states and disabled future Habit cells.

V1.4 does not change global Search, add bulk actions, or introduce a backend. Existing V1.3/V3 state and ZIP backups remain readable; no persisted schema bump was needed.

Since V1.9, Space Grotesk, Geist and the Phosphor icon styles are vendored under `vendor/fonts/` and `vendor/phosphor/` with their license files (V1.4–V1.8 loaded them from public CDNs). The application itself has no backend or account requirement; the V2.0-a sync is optional.

## What is included

### Area knowledge and Goal horizons

**Notes** and **Resources** have dedicated sidebar lists and detail editors, with optional Area assignment, links, and attachments. Area Detail also shows their counts and contextual creation controls. Resources can link to Tasks, Projects, Goals, and Habits; deleting an Area clears its assignment without deleting these records. Goal create/edit includes Short-term, Mid-term, and Long-term horizons; **By month** groups Goals by target date, with undated Goals separate.

Automated Node checks now cover metadata editing, ownership, ZIP round trips and failure recovery for these additions. Native browser reload, attachment interactions and keyboard/focus acceptance remain a separate user-owned-browser acceptance check.

### Prototype routines and starter examples

Habit create/edit includes Morning, Daily, and Night routines. The active Habits view groups these routines; Today continues to follow each Habit's schedule.

Use **Settings → Data → Add starter examples** to add eight editable Areas (Family & Friends, Work, Personal Growth, Home, Travel, Health, Career, Finance) and twelve editable Habits. Morning: Cold shower, Wim Hof breathing, 10-minute workout, Beard balm. Daily: No-nut, Training four times per week, Sleep before midnight, Sleep 7–8 hours, Program 30 minutes, Read/learn 30 minutes. Night: Beard balm, Enter tomorrow's tasks. Training uses four times per week; the others use daily schedules. New Habits have no Area, Goal links, reminders, or check-in history.

The action is explicit and adds only missing examples. Stable markers prevent repeat creation after edits; matching Area names and Habit names within the same routine also prevent initial duplicates without modifying user records. Archived/paused matches remain untouched. Deleting an example makes it eligible to be added again. Starter-action repetition, reload persistence, and routine interactions remain unverified in a browser under the fast-prototype workflow.

### Core task workflow

- Today with Overdue, manually planned tasks, rule-based Suggestions and Completed-today
- Inbox capture and quick processing, with mixed-record filters for Tasks, Goals, Habits, Notes and Resources
- Upcoming grouped by earliest relevant future planned/due date
- Anytime for processed active tasks that are not planned for a date
- Flat Projects with project colors, archive/restore and manual ordering
- Completed history with Project and Period filters
- Notes and one-level Subtasks
- Separate Plan for and Due date semantics
- In-app reminders with optional browser notifications
- Recurring tasks: daily, weekly, monthly and custom interval
- Delete/complete/move/archive Undo where applicable

### V1.2/V1.3 — Tags

Tags are global reusable objects, not per-task strings.

- Dedicated **Tags** sidebar screen
- Add / Edit / Delete
- Fixed color palette
- Case-insensitive duplicate-name prevention
- Multiple tags can be assigned to one task
- Tags available in Quick Add → More and Task Detail
- One selected tag at a time on the Tags screen
- Selected tag shows its active tasks
- Editing a tag updates it everywhere
- Deleting a tag removes only its references; tasks are never deleted

Task metadata stores only `tagIds[]`.

### V1.2/V1.3 — Priority

Supported values:

```text
none | low | medium | high
```

Priority is descriptive metadata only. It does **not** change manual ordering, Today membership, Suggestions or Search ranking.

The list UI uses a small flag indicator:

- High — danger/red
- Medium — warning/yellow
- Low — muted info tone
- None — no indicator

### V1.2/V1.3 — Attachments

Attachments are real local files stored as Blobs in IndexedDB.

- In Task Detail, find files under **Task properties → Attachments**; Quick Add remains lightweight
- Use **Add image** for an image-filtered file chooser, or **Add attachment** / drag & drop for any file type
- Both choosers share the same attachment list, limits, ownership, and delete/Undo flow; image filtering is chooser guidance, not a separate file store or preview
- All file types allowed
- Maximum **10 MB per file**
- Maximum **10 attachments per task**
- File name, type and size are shown
- Open / Download / Delete actions
- Attachment Delete + Undo restores the same attachment ID and Blob
- Task Delete + Undo preserves/restores all referenced files during the Undo window
- Expired pending deletions are cleaned from IndexedDB

Binary files never enter localStorage.

Notes and Resources use the same attachment store and limits (10 files per owner). Existing Task attachment IDs and ownership remain unchanged. The current implementation exports ZIP `backupVersion: 2` with knowledge files and accepts valid backup versions 1 and 2. The `exportBackupV3` function name refers to the V3 state schema, not ZIP format 3.

### V1.2/V1.3 — Duplicate task

Duplicate copies task metadata and creates independent subtask IDs.

If the task has attachments, the user chooses:

```text
Cancel | Without files | Copy files
```

`Copy files` creates independent attachment records with new IDs and new task ownership. A failed multi-file copy rolls back partial attachment copies and does not create a half-finished duplicate task.

### V1.2/V1.3 — Faster planning

Natural-language Quick Add recognizes only deterministic phrases: trailing clauses at the end of the title and a few tokens anywhere in it.

```text
Send invoice tomorrow
Call today
Update homepage Friday
Pošalji fakturu sutra u 9:30
Izveštaj +Klijenti rok petak 1,5h
```

Unsupported/non-trailing phrases are left untouched. An explicitly selected Plan date always wins over parsed text. V1.9 added the Serbian keywords `danas`, `sutra`, weekdays (optionally after `u`) and `u H:MM`. Since V1.10, `Core.parseQuickAdd` also reads due dates (`rok petak`, `do petka`, `due friday`), durations (`45min`, `1h30`, `2 sata`), relative and calendar plan dates (`prekosutra`, `za 3 dana`, `in 2 weeks`, `15.10.`), Serbian priorities (`!visok`, `!srednji`, `!nizak`), `+project` and `@area`, and the Quick Add dialog previews the recognized fields under the title. Values chosen in the Quick Add pickers still win; see the V1.10 section above.

Task drag & drop now supports context moves in addition to same-list reordering:

- task → Today
- task → Tomorrow
- task → active Project

Context-changing drops are undoable. Equivalent task-menu actions remain available for keyboard/non-drag workflows.

The task context menu includes contextually appropriate actions for Today/Tomorrow planning, Plan for, Due date, Project, Duplicate and Delete.

## Storage architecture

V1.6 retains the hybrid local storage model and schema V3 introduced in V1.3.

### localStorage

Key:

```text
todoAppData
```

Schema version:

```text
version: 3
```

Stores compact Task/Project/Area/Goal/Habit/Note/Resource/Template/Saved View/tag/settings/UI metadata. Supported V1/V2 states migrate to V3 without changing existing IDs. The earlier V1-to-V2 migration added these defaults, which are retained:

```js
tags = []
task.tagIds = []
task.priority = 'none'
task.attachmentIds = []
```

Existing reminders, recurrence, archived projects, completed history, manual ordering and UI preferences are preserved.

### IndexedDB

Database:

```text
todoAppDB
```

Object stores (database version 1, distinct from metadata schema V3):

```text
attachments
habitLogs
goalHistory
recoverySnapshots
```

Each attachment record contains its ID, Task/Note/Resource ownership, file metadata, Blob, timestamps and optional pending-delete timestamp. The legacy V1.2 `todoAppAttachments` database is copied non-destructively into the shared attachment store during migration.

## Backup and restore

Settings → Data provides a full ZIP backup instead of the older JSON-only export.

Export structure:

```text
todo-backup-YYYY-MM-DD.zip
├── data.json
└── attachments/
    └── task_<taskId>/
        └── <files>
```

`data.json` contains schema/app metadata, the complete local app state and attachment metadata. Referenced attachment Blobs are stored as files in the ZIP.

Import/Restore uses **Replace All**, never Merge:

1. Read ZIP
2. Validate `data.json` and backup version
3. Validate task/tag/project/attachment references
4. Validate every referenced attachment file and size
5. Show a backup summary
6. Ask for explicit Replace All confirmation
7. Replace IndexedDB and app metadata

Validation happens before destructive replacement. If restore fails during the replacement phase, the previous metadata and attachment store are restored from snapshots.

Reset App clears both metadata and IndexedDB. Clear Completed permanently removes attachment records belonging to the cleared completed tasks.

## Search and bulk actions

V1.2 intentionally does **not** change Search. Search continues to cover task titles, task notes and project names, including completed tasks, with the same ranking as before.

V1.2 intentionally has **no bulk-selection or bulk-action UI**.

## Keyboard

- `N` — New task
- `Ctrl/Cmd + F` — Search
- `/` — Search
- `T` — Today
- `I` — Inbox
- `U` — Upcoming
- `Esc` — close the highest active overlay/edit state

Modal dialogs trap keyboard focus. Confirmation dialogs return focus to their trigger when closed where that trigger still exists.

## Tests

Run all current regression/integration checks. The browser commands below are optional developer/CI checks. This release verification does not launch an isolated Chromium and does not open or modify the user's personal Chrome; visual and interaction acceptance is intentionally user-owned.

If you explicitly choose to run the historical browser harness in CI, install its pinned dependency in a worktree-local virtual environment:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-browser-tests.txt
# CI-only: install the browser runtime used by the optional harness.
.venv/bin/python -m playwright install chromium
```

Then run:

```bash
node --test tests/*.test.js
.venv/bin/python tests/test_browser_path_adapter.py
.venv/bin/python tests/run-browser-regressions.py
.venv/bin/python tests/ui-v1-3-storage-migration.py
.venv/bin/python tests/ui-v1-3-goal-ux.py
```

Syntax checks:

```bash
for file in js/*.js vendor/*.js tests/*.js tests/support/*.js sw.js; do node --check "$file"; done
```

The Playwright scenarios in `tests/ui-*.py` select elements by English text. They are out of date for the V1.9 Serbian UI and are not part of release verification; `tests/run-browser-regressions.py --dry-run` runs only their static contracts.

The optional browser harness uses an in-memory test adapter or a temporary loopback server with real IndexedDB. It is isolated CI tooling, not a production runtime requirement and not part of the user's Chrome session. Production defaults to real IndexedDB. `TodoApp.ready` can be awaited for startup migration and Habit hydration before interacting with the ready app.

Goal creation keeps milestones, reminders and source-specific links under More. Nested editors change only the draft until Create/Save. Goal Detail offers inline title/Area/target/unit/date editors (Save or Enter to commit, Cancel or Escape to discard), dedicated progress-source/link/milestone/reminder panels, and a quick status menu. Switching progress source retains inactive relationships and manual values. The native Goal UX suite covers these controls, contextual/template dates, reciprocal links, cancellation, validation, focus, keyboard behavior and reload persistence.

## Still intentionally excluded

- bulk actions
- tag-aware / priority-aware Search changes
- multi-day hourly grid, block resizing and automatic scheduling (V1.12 adds a single-day hour grid in Calendar → Dan)
- elapsed-time tracking (optional planned Task duration is supported)
- comments / collaboration
- sync of attachments and goal history (V2.1), the App Store / Google Play release (V2.0-c), password or social sign-in, sharing between users
- AI planning
- integrations
- inline image/PDF attachment preview

## Brand reference

The UI follows the supplied Universal Brand Design System v1: dark technical foundation, electric-blue actions/focus, mint positive states, restrained semantic color, Space Grotesk + Geist typography direction, Phosphor icon direction, approved sidebar geometry and precise motion/reduced-motion behavior. V1.8 implements it as the Quiet Graphite / Swiss Compact token system at the top of `css/styles.css`. V1.9 serves the fonts and icons locally and adds the Home Screen icons in `icons/` (generated by `tools/generate-icons.py`).

## Codex / agent handoff

For Codex or another coding agent, start with:

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/codex/PRODUCT_BRIEF.md`](docs/codex/PRODUCT_BRIEF.md)
3. [`docs/codex/V1_3_SCOPE.md`](docs/codex/V1_3_SCOPE.md)
4. [`docs/codex/TASKS.md`](docs/codex/TASKS.md)
5. [`docs/codex/ACCEPTANCE.md`](docs/codex/ACCEPTANCE.md)

The detailed approved V1.3 spec and implementation plan remain under `docs/superpowers/`.
