# Current implementation architecture

This document records the V1.9 implementation inspected on 2026-10-07, the V1.10 Quick Add parser (`c64bd81`), the V1.11 weekly review (`5bbd820`) and the V1.12 time-blocking (`d00855b`), inspected on 2026-10-08. It describes mechanisms present in source, not proof of functional, visual or native-browser acceptance. Read `AGENTS.md` and the applicable versioned spec before changing behavior.

## Composition and module boundaries

The app is a static HTML/CSS/vanilla JavaScript browser application using classic scripts, not ES modules or a framework. `index.html` loads JSZip, Release (`js/release.js`), I18n (`js/i18n.js`), the Serbian catalog (`js/i18n-sr.js`), Core, Storage, Attachments, Backup, the domain registry, UI adapters, and finally `app.js`, in that order. Shared APIs live on `window`/`globalThis`; Release, I18n, Core, Storage, Attachments and Backup also expose CommonJS exports for tests.

UI adapters register `renderRoute`, `handleAction`, `handleInput`, or additional hooks with `TodoDomainModules`. `app.js` calls adapters in registration order and accepts the first result that is neither `undefined` nor `false`. A handler returns `true` when it has consumed an event; renderers return HTML. Task rows additionally use the `renderTaskRow` hook.

`domainContext()` supplies live state/modal getters plus shared lookup, rendering, overlay, persistence, attachment and domain-operation helpers. Adapters are therefore coupled to this controller contract rather than independent state stores. Many adapters mutate shared records and then call supplied save/render helpers; not all domain mutations have moved out of `app.js`.

## Boot and ready flow

1. Scripts define shared APIs and register adapters. `app.js` publishes `TodoApp` and calls `init()` immediately.
2. `init()` attaches delegated/document and window events, closes the mobile capture disclosure, and awaits `startReady()`.
3. `startReady()` queues incoming loads and publishes one startup promise. `loadState()` first enters the loading/recovery surface, opens Storage and checks retained global-operation snapshots. Interrupted operations can block normal loading and expose recovery actions.
4. Metadata is read from `localStorage.todoAppData`. Missing metadata creates sample state. Existing metadata goes through Core V3 migration, app normalization, storage migration preparation, validation and source-change checks. Invalid/incompatible data enters recovery rather than silently resetting.
5. The ready drain renders around loading, hydrates Habit metrics/history, evaluates Habit boundaries, checks that metadata is still the committed source, runs due scheduled Task templates, renders again and checks reminders. Expired attachment cleanup protects currently owned and Undo-related files.
6. Startup schedules an automatic snapshot, reads the storage-persistence status without requesting it, registers the service worker (V1.9), defaults an empty hash to `#today`, and starts a 30-second open-app timer for scheduled templates, date-boundary refresh and reminders.

`TodoApp.ready` exposes the current ready promise; `TodoApp.state` exposes current live state. This is a browser/controller integration surface, not a remote API. Scheduled templates and reminders depend on the running page; there is no background server executing them while the application is closed.

## State and persistence

Metadata schema version is `3`. The main object contains Tasks, Projects, Tags, Areas, Goals, Habits, Notes, Resources, Templates, Saved Views, settings and UI preferences. Core normalizes records and relationships. Tasks exist once in `state.tasks`; list membership is derived. Subtasks and Goal milestones are nested records. Cleaning uses marked Projects and their Tasks rather than new collections.

`saveState()` normalizes metadata, updates the Focus selection, omits transient `habitLogCache` and `habitMetrics`, and writes compact JSON to `todoAppData`. It reports failures and schedules a snapshot after successful saves. `saveAndRender()` attempts saving and then renders; a rendered edit is not evidence that its storage write succeeded. Text edits also use a short debounce and flush paths.

IndexedDB database `todoAppDB`, database version `1`, has `attachments`, `habitLogs`, `goalHistory` and `recoverySnapshots` stores. Database version, metadata schema version and ZIP format version are different contracts. In the inspected `backup.js`, `BACKUP_VERSION` is `2`, export writes `backupVersion: 2` and the historical manifest field `appVersion: '1.3'`, and inspection accepts backup versions `1` and `2`. The function name `exportBackupV3` refers to the V3 state payload; it does not mean ZIP format 3. Storage also handles the legacy `todoAppAttachments` database. Files are Blobs in IndexedDB and metadata retains attachment IDs. Attachments supports Tasks, Notes and Resources through shared owner checks.

Automatic captures are scheduled after one idle second, rate limited to five minutes and retain five automatic snapshots; operation-recovery copies are separate. They include normalized metadata and associated stored records and consume the same browser quota as application data. An exported ZIP is a separate portable artifact.

## Localization (V1.9)

- The browser UI is Serbian Latin only; there is no language setting and nothing is persisted for it.
- `js/i18n.js` publishes `TodoI18n`. English source strings are the translation keys, with `{name}` placeholders:
  - `tr(source, params)` returns the catalog entry or the English source;
  - `trn(count, one, other, params)` picks the plural with `Intl.PluralRules`; a plural entry is keyed by the English "other" form and holds `one`/`few`/`other`;
  - `msg(source)` only marks a key (lookup-table labels, persisted status sentences, thrown errors) without translating it;
  - `trMessage(text)` translates a stored or thrown message at display time: the whole text when it is a key, otherwise "Prefix: detail" with the prefix translated; unknown text passes through.
- `js/i18n-sr.js` adds the Serbian catalog and calls `setLanguage('sr')`, which also sets `<html lang="sr-Latn">`. `I18n.locale()` is then `sr-Latn-RS` (plain `sr` would be Cyrillic in `Intl`) and drives every `Intl` date and number format.
- UI modules read `window.TodoI18n` directly. `js/core.js`, `js/backup.js` and `js/storage.js` keep a local identity `msg`, so they stay loadable without I18n and their errors stay English until `trMessage` displays them.
- Node tests load `js/i18n.js` without the catalog, so rendered output stays English; only `tests/i18n-v1-9.test.js` loads `js/i18n-sr.js` to assert Serbian output. VM sandboxes get the English `I18n` through `tests/support/i18n.js` (`withI18n`, `runInNewContextWithI18n`).
- `js/release.js` loads before I18n and therefore looks `TodoI18n` up lazily when it builds a problem report.

## Install, offline shell and updates (V1.9)

- `manifest.webmanifest` plus the iOS meta tags make Dailo installable as a standalone app; `viewport-fit=cover` enables the `env(safe-area-inset-*)` padding in CSS.
- `registerServiceWorker()` in `app.js` registers `sw.js` only on `https:`, `localhost` or `127.0.0.1`, never in Node tests.
- `sw.js` lifecycle:
  - **install** precaches `SHELL_FILES` (the exact runtime shell: `index.html`, manifest, CSS, every `js/*.js`, vendored fonts/icons and JSZip, `icons/*`) into `dailo-shell-<VERSION>`, where `VERSION` equals `APP_VERSION`;
  - **activate** deletes older `dailo-shell-*` caches and claims clients;
  - **fetch** ignores non-GET and cross-origin requests; serves shell files cache-first (query strings ignored); answers navigations to the app page (`./`, `index.html`) with the cached `index.html`; leaves other pages and downloads under the scope (docs, release ZIPs) to the network.
- Updates: a new worker installs and waits. When a page that is already controlled sees a waiting worker, the toast "A new version of Dailo is available." offers Refresh. Only `applyAppUpdate()` (the Refresh action) flushes pending text, posts `SKIP_WAITING` and reloads once on `controllerchange`. The first install shows no prompt, and the page never reloads by itself.
- Bump `APP_VERSION` and `sw.js` `VERSION` together; a changed `sw.js` is how installed apps learn about a release.

## Data protection (V1.9)

- **Persistence.** `refreshStoragePersistence(request)` feature-detects `navigator.storage.persisted/persist/estimate` and reports `granted`, `denied`, `unsupported` or `unknown` with usage/quota. Startup only reads the status. The first user click of a session requests persistence once, and Settings → Data offers Request while the state is `denied`. The click trigger replaces the spec's "after the first successful save", because timer-driven saves can happen without user activity.
- **Backup reminder.** `backupReminderNotice()` runs only from `renderToday()`, never inside modals. It asks `Core.backupReminderDue()` with `backupStatus.lastExport`, `Core.backupReminderDays(settings)`, the oldest record `createdAt` and the device-local snooze time. When due, it renders one `role="status"` panel with Export backup (the existing `export-backup` action) and Remind me tomorrow (snooze for 24 h in localStorage `todoAppBackupReminderSnoozedUntil`).
- **Problem report.** `environmentInfo()` supplies the user agent, standalone flag and persistence state to `DailoRelease.problemReportMailto()`; app data is never included.

## Quick Add parsing (V1.10)

- **Core.** `Core.parseQuickAdd(text, { today, tags, projects, areas, parsePlan })` is pure and returns `{ title, plannedDate, plannedTime, dueDate, durationMinutes, priority, tagIds, projectId, areaId }` (`null` or `[]` when absent).
  - **Tokens first.** `#tag`, `!priority` (English or Serbian), `+project` and `@area` are taken from anywhere in the title. Projects and Areas use a loose name match (case, spaces, `_`, `-` and diacritics ignored, `đ` as `dj`) and skip archived records; `#tag` matching is unchanged, and several tags can apply. For priority, project and Area the first token wins and later ones stay in the title; unknown tokens stay too. A project clears the Area.
  - **Then trailing clauses.** The remaining words are read right to left; each step takes one clause (plan date, time, due date or duration) from the end. Parsing stops at the first ordinary word, at a second clause of a kind already found, or when a clause would consume every remaining word (at least one title word stays). A clause that matches but is invalid returns the token-free title without any clause fields.
  - `parsePlan: false` (an explicit Plan date) stops at plan-date words, so they stay in the title; time, due date and duration still parse.
  - `Core.parseQuickPlanPhrase` is a wrapper with tokens off and only the plan-date and time slots, keeping its V1.5/V1.9 results. V1.9's `Core.splitQuickTime` is gone.
- **App.**
  - `parseQuickAddTitle(title, parsePlan)` passes `Core.dateOnly()` and the live tags, projects and Areas.
  - The `quick-title` input handler re-parses on every keystroke: it replaces the `data-quick-preview-slot` content with `quickParsePreview(parsed)` and, without an explicit plan, updates the Plan chip. `renderQuickModal()` renders the same slot.
  - `createTask()` re-parses at save time. Picker values win (an explicitly chosen plan date — a parsed plan date still beats a context default — time, due date, duration, project, Area); a project wins over an Area. `isInbox` and `projectOrder` use the resolved project, and parsed priority wins over the default `none`.
- **Preview.** Read-only pills (`.quick-parse-item`) inside `data-quick-preview` (`role="group"`, `aria-label` "Recognized in title") in a slot with `aria-live="polite"`; the slot is empty and hidden (`:empty`) when nothing is recognized. Labels reuse `relativeDateLabel`, `priorityLabel` and the catalog keys "Due {date}" and "{minutes} min".
- **Duration chip (V1.12).** The "Trajanje" property chip (`quick-duration-picker`) opens a popover of 15/30/45/60/90/120 min, plus "Ukloni trajanje" when a value is set; `set-duration` writes `modalState.draft.durationMinutes`, and `createTask` uses `d.durationMinutes || parsed.durationMinutes`, so the chip wins.

## Weekly review (V1.11)

- **Core (pure).** `Core.deriveWeeklyReview(state, today, weekStartsOn)` returns `{ weekStart, inbox, overdue, missedPlans, nextDays, goals, habits, areas }`. Overdue uses `isOverdue` (oldest due first); missed plans are open tasks with a past `plannedDate` that are not overdue (oldest first); `nextDays` holds seven `{ date, planned, due }` counts of open tasks; goals carry `getGoalHealth`; Areas carry `areaSummary(...).openTasks`. The week start uses the same `weekStartFor` rule as Settings.
- **Log.** `Core.weeklyReviewLog(settings)` sanitizes `settings.weeklyReviews` (valid `weekStart` date and ISO `completedAt`, newest first, one per week, at most 26). `Core.recordWeeklyReview(settings, { today, now, weekStartsOn })` returns the new list with this week added or replaced. `Core.weeklyReviewDue(settings, today, weekStartsOn)` is true from week start + 4 days until this week has an entry.
- **Page.** `js/review-ui.js` registers the domain module `review`; its `renderRoute` answers only `{ type: 'review' }`. Rows come from `ctx.reviewTaskRow(task, context, options)` (the controller's `taskRow`): Inbox rows use context `inbox` with `{ inbox: true }`, overdue and missed rows context `today` with `{ overdue: true }`, so their existing quick actions apply. Goals, Habits and Areas are `data-route` links; habit metrics come from `ctx.habitMetrics`.
- **App.** `weeklyReviewNotice()` renders on Today after `backupReminderNotice()` (a `role="status"` section with a `data-route="review"` button, never a modal). The `complete-weekly-review` action calls `completeWeeklyReview()`: record, `saveState()`, toast, `render()`.

## Time-blocking and capacity (V1.12)

- **Core (pure).**
  - `Core.daySchedule(tasks, date, { defaultMinutes = 30 })` returns `{ blocks, unscheduled, range }`. Blocks are tasks planned on `date` with a valid `plannedTime`, sorted by start: `{ task, startMinutes, endMinutes, durationMinutes, estimated, conflict }`; a missing duration uses `defaultMinutes` and sets `estimated`; `conflict` compares open blocks only, so completed blocks never conflict. `unscheduled` lists open untimed tasks by `todayOrder`, then title. `range` is `{ startHour: min(6, first block hour), endHour: 24 }`.
  - `Core.dayLoad(tasks, date)` returns `{ minutes, withDuration, withoutDuration }` for open tasks planned on `date`.
  - `Core.dailyCapacityMinutes(settings)` returns an integer 0–1440 from `settings.dailyCapacityMinutes`, otherwise 360; 0 means off.
- **Calendar day view.** `renderCalendar` accepts `day` besides `week`/`month`; `renderDayView(ctx, date, visibility)` draws the capacity bar, the "Bez vremena" section (`data-calendar-date`, rows with `data-calendar-drag="task"` and a time input `data-task-time="plannedTime"`), and the grid: `data-calendar-date` wraps hour rows `data-calendar-time="HH:00"` and absolutely positioned block buttons (`top`/`height` as `calc(var(--hour-height) * hours)`, `--hour-height` 52px). Blocks are also `data-calendar-drag="task"` and open the task on click.
- **Reused handlers.** The existing `handleDrop` finds the nearest `[data-calendar-time], [data-calendar-date]` target and calls `updateTask(id, { plannedDate, plannedTime? })`, so a drop on an hour row sets date and hour and a drop on "Bez vremena" sets only the date. The existing `[data-task-time]` change handler writes `Core.normalizeTime(value)`. No new event store or drag type.
- **State and navigation.** The app's `normalizeState` keeps `ui.calendarView` in `day`/`week`/`month` (default `week`); `navigateCalendar(direction)` moves one day in the day view, seven days in the week view and one month in the month view.
- **Today and Settings.** `todayCapacityItem()` uses `Core.dayLoad` for today and `durationLabel`, and renders inside the focus strip (`settings.todayFocusStrip`). Settings → General `#daily-capacity` is handled in the change listener: an integer 0–1440 is stored with `saveAndRender()`.

## Routes, rendering and events

`currentRoute()` parses `location.hash`; supported list routes include Today, Inbox, Upcoming, Calendar, Anytime, Tags, Areas, Notes, Resources, Goals, Habits, Templates, Projects, Cleaning, Saved Views, Archived, Completed, Review (`#review`, V1.11) and Settings. Detail routes use `project/`, `area/`, `goal/`, `habit/`, `note/`, `resource/` and `saved-view/` IDs. Missing records fall back according to route type. Task detail opens as a modal rather than a task hash route.

`navigate()` closes overlays and updates the hash. A hash change closes overlays and renders. `render()` chooses recovery or the normal sidebar/main surface. `renderMain()` asks adapters first, falls back to controller-owned daily task/Tags/Completed screens, and replaces main content with generated HTML. Sidebar and modal content are also regenerated. Today personalization is applied after its markup is inserted.

Delegated listeners interpret `data-route`, `data-action`, property and contextual dataset attributes. Adapter action/input hooks get a chance to consume relevant events before controller fallback handlers. Shared listeners cover clicks, input/change/blur, keyboard, pointer swipe and drag/drop. Thus replacing content does not require attaching a listener to every new row. Overlay focus restoration tracks connected elements or logical dataset selectors because rendering can replace the original trigger node.

Mutations typically update a shared record, save, and re-render affected surfaces; async operations additionally validate live source/ownership where implemented. `storage` events can queue another ready load for valid metadata from another tab; malformed external state is ignored. Source guards protect migration/global replacements from stale data, and the current UI exposes a concise stale-data refresh path rather than overwriting newer canonical bytes. This is browser-local coordination, not a conflict-resolution or collaborative synchronization service.

## Derived views

| Surface | Current derivation |
| --- | --- |
| Today | Core divides Tasks into overdue, planned today, rule-based Suggestions and completed today. Overdue takes precedence over planned today. Suggestion reasons are due today, missed plan, due tomorrow and due soon; priority is not a ranking input. App adds scheduled Habits, Goals/milestones, Focus, Daily Review and personalized cards. |
| Inbox | Active inbox records ordered by inbox order, with creation time as fallback. |
| Upcoming | Earliest relevant future planned/due Task date plus future active Goals through Core; app adds scheduled Habits and active incomplete dated milestones for the next 14 days. |
| Anytime | Core-selected processed active Tasks without a planned date. |
| Project / Tag / Area | Filters and relationships over shared collections. A Project Task's effective Area comes from its Project. |
| Completed | Shared completed Tasks with Project/period filtering and completion ordering. |
| Calendar | Events derived from planned/due Tasks, Goal dates, milestones and Habit schedules. Planned Task time/duration provides overlap hints; there is no separate persisted calendar-event collection. Drag operations change shared dates. The V1.12 day view projects only Tasks through `Core.daySchedule`/`Core.dayLoad`. |
| Weekly review | `Core.deriveWeeklyReview` over shared Tasks, Goals, Habits and Areas; the only persisted output is the `settings.weeklyReviews` log. |
| Saved View | Core applies the saved filters to exactly one of Tasks, Goals or Habits. It does not replace global Search. |
| Goal progress / Habit insights | Calculated from current links and stored logs/history; hydrated caches are runtime aids rather than another persisted task/goal store. |
| Cleaning | Active marked room Projects and their ordinary Tasks, grouped by room and open/completed state. |

Planned date/time and due date/time are independent metadata. Manual ordering fields are explicit; priority remains descriptive. Cross-surface consistency depends on shared records and re-derivation, not copying a Task into each surface.

## Recovery and integration boundaries

Normal deletion uses confirmation and the app's Undo/delete lifecycle, with owned records/files retained or restored as appropriate. Reset, ZIP replacement and selective restore coordinate a downloaded safety ZIP, internal recovery snapshot, typed confirmation, guarded writes, verification and rollback. Post-commit cleanup failures retain recovery information instead of treating a verified replacement as uncommitted. Selective restore preparation reconciles supported reciprocal links; missing dependencies can stop replacement. Inspect `backup.js`, `storage.js` and coordinating app operations together before changing this contract.

Browser integrations are localStorage, IndexedDB, file inputs/drag-drop, Blob/object-URL downloads/opening, optional Notification permission, dates/timers, hash navigation and, since V1.9, the Storage API (`navigator.storage`), a service worker with Cache Storage and `mailto:` links. Fonts, Phosphor icons and JSZip are vendored; no CDN is used at runtime. No account system, HTTP business API, WordPress integration, external calendar synchronization, cloud destination or push notification is supplied by these runtime files. The service worker caches the app shell only; reminders and scheduled templates still run only while the page is open.

Node tests exercise pure rules, storage/backup logic and selected controller/adapter behavior with doubles; Python scenarios exercise browser paths when actually run in an available browser. Existing progress documents distinguish automated release checks from deferred browser/visual acceptance. This documentation change does not verify persistence, keyboard, mobile or visual behavior in a native browser.
