# Current implementation architecture

This document records implementation inspected on 2026-10-07. It describes mechanisms present in source, not proof of functional, visual or native-browser acceptance. Read `AGENTS.md` and the applicable versioned spec before changing behavior.

## Composition and module boundaries

The app is a static HTML/CSS/vanilla JavaScript browser application using classic scripts, not ES modules or a framework. `index.html` loads JSZip, Core, Storage, Attachments, Backup, the domain registry, UI adapters, and finally `app.js`, in that order. Shared APIs live on `window`/`globalThis`; Core, Storage, Attachments and Backup also expose CommonJS exports for tests.

UI adapters register `renderRoute`, `handleAction`, `handleInput`, or additional hooks with `TodoDomainModules`. `app.js` calls adapters in registration order and accepts the first result that is neither `undefined` nor `false`. A handler returns `true` when it has consumed an event; renderers return HTML. Task rows additionally use the `renderTaskRow` hook.

`domainContext()` supplies live state/modal getters plus shared lookup, rendering, overlay, persistence, attachment and domain-operation helpers. Adapters are therefore coupled to this controller contract rather than independent state stores. Many adapters mutate shared records and then call supplied save/render helpers; not all domain mutations have moved out of `app.js`.

## Boot and ready flow

1. Scripts define shared APIs and register adapters. `app.js` publishes `TodoApp` and calls `init()` immediately.
2. `init()` attaches delegated/document and window events, closes the mobile capture disclosure, and awaits `startReady()`.
3. `startReady()` queues incoming loads and publishes one startup promise. `loadState()` first enters the loading/recovery surface, opens Storage and checks retained global-operation snapshots. Interrupted operations can block normal loading and expose recovery actions.
4. Metadata is read from `localStorage.todoAppData`. Missing metadata creates sample state. Existing metadata goes through Core V3 migration, app normalization, storage migration preparation, validation and source-change checks. Invalid/incompatible data enters recovery rather than silently resetting.
5. The ready drain renders around loading, hydrates Habit metrics/history, evaluates Habit boundaries, checks that metadata is still the committed source, runs due scheduled Task templates, renders again and checks reminders. Expired attachment cleanup protects currently owned and Undo-related files.
6. Startup schedules an automatic snapshot, defaults an empty hash to `#today`, and starts a 30-second open-app timer for scheduled templates, date-boundary refresh and reminders.

`TodoApp.ready` exposes the current ready promise; `TodoApp.state` exposes current live state. This is a browser/controller integration surface, not a remote API. Scheduled templates and reminders depend on the running page; there is no background server executing them while the application is closed.

## State and persistence

Metadata schema version is `3`. The main object contains Tasks, Projects, Tags, Areas, Goals, Habits, Notes, Resources, Templates, Saved Views, settings and UI preferences. Core normalizes records and relationships. Tasks exist once in `state.tasks`; list membership is derived. Subtasks and Goal milestones are nested records. Cleaning uses marked Projects and their Tasks rather than new collections.

`saveState()` normalizes metadata, updates the Focus selection, omits transient `habitLogCache` and `habitMetrics`, and writes compact JSON to `todoAppData`. It reports failures and schedules a snapshot after successful saves. `saveAndRender()` attempts saving and then renders; a rendered edit is not evidence that its storage write succeeded. Text edits also use a short debounce and flush paths.

IndexedDB database `todoAppDB`, database version `1`, has `attachments`, `habitLogs`, `goalHistory` and `recoverySnapshots` stores. Database version, metadata schema version and ZIP format version are different contracts. In the inspected `backup.js`, `BACKUP_VERSION` is `2`, export writes `backupVersion: 2` and the historical manifest field `appVersion: '1.3'`, and inspection accepts backup versions `1` and `2`. The function name `exportBackupV3` refers to the V3 state payload; it does not mean ZIP format 3. Storage also handles the legacy `todoAppAttachments` database. Files are Blobs in IndexedDB and metadata retains attachment IDs. Attachments supports Tasks, Notes and Resources through shared owner checks.

Automatic captures are scheduled after one idle second, rate limited to five minutes and retain five automatic snapshots; operation-recovery copies are separate. They include normalized metadata and associated stored records and consume the same browser quota as application data. An exported ZIP is a separate portable artifact.

## Routes, rendering and events

`currentRoute()` parses `location.hash`; supported list routes include Today, Inbox, Upcoming, Calendar, Anytime, Tags, Areas, Notes, Resources, Goals, Habits, Templates, Projects, Cleaning, Saved Views, Archived, Completed and Settings. Detail routes use `project/`, `area/`, `goal/`, `habit/`, `note/`, `resource/` and `saved-view/` IDs. Missing records fall back according to route type. Task detail opens as a modal rather than a task hash route.

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
| Calendar | Events derived from planned/due Tasks, Goal dates, milestones and Habit schedules. Planned Task time/duration provides overlap hints; there is no separate persisted calendar-event collection. Drag operations change shared dates. |
| Saved View | Core applies the saved filters to exactly one of Tasks, Goals or Habits. It does not replace global Search. |
| Goal progress / Habit insights | Calculated from current links and stored logs/history; hydrated caches are runtime aids rather than another persisted task/goal store. |
| Cleaning | Active marked room Projects and their ordinary Tasks, grouped by room and open/completed state. |

Planned date/time and due date/time are independent metadata. Manual ordering fields are explicit; priority remains descriptive. Cross-surface consistency depends on shared records and re-derivation, not copying a Task into each surface.

## Recovery and integration boundaries

Normal deletion uses confirmation and the app's Undo/delete lifecycle, with owned records/files retained or restored as appropriate. Reset, ZIP replacement and selective restore coordinate a downloaded safety ZIP, internal recovery snapshot, typed confirmation, guarded writes, verification and rollback. Post-commit cleanup failures retain recovery information instead of treating a verified replacement as uncommitted. Selective restore preparation reconciles supported reciprocal links; missing dependencies can stop replacement. Inspect `backup.js`, `storage.js` and coordinating app operations together before changing this contract.

Browser integrations are localStorage, IndexedDB, file inputs/drag-drop, Blob/object-URL downloads/opening, optional Notification permission, dates/timers and hash navigation. Google Fonts and Phosphor CSS are external presentation dependencies. JSZip is vendored. No account system, HTTP business API, WordPress integration, external calendar synchronization, cloud destination or service-worker execution is supplied by these runtime files.

Node tests exercise pure rules, storage/backup logic and selected controller/adapter behavior with doubles; Python scenarios exercise browser paths when actually run in an available browser. Existing progress documents distinguish automated release checks from deferred browser/visual acceptance. This documentation change does not verify persistence, keyboard, mobile or visual behavior in a native browser.
