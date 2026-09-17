# Dailo — HTML Prototype v1.6

Desktop-first, local-first functional prototype for a personal/freelancer task tracker. The product keeps a simple workflow:

**Capture → Organize → Plan → Complete**

`plannedDate` means when you intend to work on a task. `dueDate` is its deadline. A task exists once; Today, Inbox, Upcoming, Anytime, Projects, Tags and Completed are derived views over the same task data.

## Run

This is a static HTML/CSS/vanilla JavaScript prototype. Serve the folder with a small local web server:

```bash
cd todo-app-prototype-v1.3
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## V1.6 highlights

- Task duration, a three-task Today Focus queue, inline completion/planning and Daily Review.
- Trailing Quick Add date/time phrases with explicit field values taking precedence.
- Goal health and linked contributions; Habit minimum/ideal targets, grace-day recovery and rolling weekly/monthly insights. Numeric Habit targets can be fractional; weekly check-in targets remain whole counts.
- Calendar task blocks use planned time plus duration and mark overlaps without introducing another event store.
- Resource type, reading status, author and review date; separate Note/Resource clips, favorites and local filters.
- Template variables/scheduled Task creation and Today section personalization.
- Bounded local snapshots and selective recovery, described below. State schema remains V3 and earlier ZIP formats remain importable.

Scheduled Task templates are one-shot per configured date. They run after saving a due schedule, during ready startup, and on the open app's 30-second checks. Missed dates catch up once when the app is next ready; variables and relative dates use the scheduled day, not the catch-up day. They do not run while the app is closed. Failed saves remain eligible for retry without duplicate Tasks. Saving a different schedule date creates a new one-shot schedule.

Today keeps its heading/date above personalized cards. Pinned cards appear first; Up/Down reorders within the pinned or unpinned group. Task/Project templates preserve Task duration, and Habit templates preserve minimum/ideal targets and grace days without execution history.

### Local snapshots and selective recovery

After successful saves, Dailo attempts an automatic snapshot after one idle second, at most once every five minutes. Startup also schedules a capture. It retains the five latest automatic copies, including normalized metadata, files, Habit logs and Goal history. Copies for interrupted operations are retained separately. These copies share the browser's storage quota and are not a substitute for an exported ZIP.

Use **Settings → Data → Local snapshots** to choose one entity from a saved version. Its record and owned files/history replace that entity's current version; unrelated records remain current. Task, Project and Habit restores also reconcile their reciprocal Goal links while preserving other Goal fields and contributions. Restoring a Goal reconciles its membership on existing Tasks, Projects and Habits without replacing their other fields or Goal links. Missing or incompatible saved contribution settings stop the restore. Linked entities must already exist: missing dependencies stop the restore and must be recovered separately. Restoring an Area or Project does not implicitly restore its children.

Each selective restore downloads a safety ZIP, creates an internal recovery copy, and requires typing **RESTORE**. The same source checks, write verification and rollback used by full restore protect selective replacement. Snackbar Undo is available briefly while data remains unchanged after restore. If later edits make Undo unsafe, the operation refuses to overwrite them and retains its safety copy for another selective recovery. Full ZIP restore and Reset retain their existing typed **RESTORE**/**RESET** safeguards.

Storage failures distinguish unsaved changes from an automatic snapshot failure and offer Retry. Reduced-motion preference suppresses animation/transition delays and reduces durations.

### Verification status

The V1.6 release verification is recorded in `docs/superpowers/progress-v1-6.md`. It includes the full Node suite, JavaScript syntax, Python AST, browser-path adapter, diff, and distributable-integrity checks. Native browser/visual acceptance remains pending: no browser was launched in this release verification, so automated results do not establish native browser persistence, visual, keyboard, or mobile acceptance.

## V1.4 foundation

V1.4 keeps the V1.3 data model and adds a faster daily-planning flow:

- Today and Upcoming surface overdue work, scheduled Habits, active Goals and dated Milestones with quick move/snooze actions.
- Task Properties expose Important, Urgent and Focus controls while preserving planned/due dates, reminders, recurrence, links and attachments.
- Calendar Week/Month/Day Detail share the same state as Tasks, Goals and Habits, including planned/due times and same-time conflict hints.
- Goal detail shows linked work and milestone progress; the Habit dashboard supports month navigation, historical check-ins, streaks and trend summaries.
- Notes and Resources stay separate and support Areas, tags, relationships and attachments.
- Mobile controls use larger touch targets, a compact Quick Add flow, keyboard-safe focus states and disabled future Habit cells.

V1.4 does not change global Search, add bulk actions, or introduce a backend. Existing V1.3/V3 state and ZIP backups remain readable; no persisted schema bump was needed.

Space Grotesk, Geist and Phosphor icon styles are referenced from public CDNs. The application itself has no backend or account requirement.

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
- Inbox capture and quick processing
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

Notes and Resources use the same attachment store and limits (10 files per owner). Existing Task attachment IDs and ownership remain unchanged. This build exports ZIP backup version 3 with knowledge files and still imports valid versions 1/2/3; older builds limited to backup version 2 cannot import newly exported version 3 ZIPs.

### V1.2/V1.3 — Duplicate task

Duplicate copies task metadata and creates independent subtask IDs.

If the task has attachments, the user chooses:

```text
Cancel | Without files | Copy files
```

`Copy files` creates independent attachment records with new IDs and new task ownership. A failed multi-file copy rolls back partial attachment copies and does not create a half-finished duplicate task.

### V1.2/V1.3 — Faster planning

Natural-language Quick Add recognizes only deterministic trailing planning phrases:

```text
Send invoice tomorrow
Call today
Update homepage Friday
```

Unsupported/non-trailing phrases are left untouched. An explicitly selected Plan date always wins over parsed text.

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

Run all current regression/integration checks. The browser command below uses a test-only adapter: on non-Linux hosts it redirects the unchanged V1.2 `/usr/bin/chromium` test launch path to Playwright's managed Chromium. It does not affect production code or direct execution of the original browser scripts.

Install the pinned browser-test dependency and Chromium once in a worktree-local virtual environment:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-browser-tests.txt
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
node --check js/core.js
node --check js/attachments.js
node --check js/backup.js
node --check js/app.js
```

The V1.2 browser harness uses an in-memory test adapter enabled only by `window.__TODO_TEST_MEMORY_DB__`. The dedicated V1.3 storage-migration suite uses a temporary loopback server, a fresh managed Chromium context per test, and real IndexedDB. It verifies automatic non-destructive legacy Blob copying, schema/indexes, native Habit/date uniqueness, exact source-state preservation on failure, safety snapshots, Retry, reload, and partial V3 recovery. Contexts, browser and server are closed even on failure. Production defaults to real IndexedDB. `TodoApp.ready` can be awaited for startup migration and Habit hydration before interacting with the ready app.

Goal creation keeps milestones, reminders and source-specific links under More. Nested editors change only the draft until Create/Save. Goal Detail offers inline title/Area/target/unit/date editors (Save or Enter to commit, Cancel or Escape to discard), dedicated progress-source/link/milestone/reminder panels, and a quick status menu. Switching progress source retains inactive relationships and manual values. The native Goal UX suite covers these controls, contextual/template dates, reciprocal links, cancellation, validation, focus, keyboard behavior and reload persistence.

## Still intentionally excluded

- bulk actions
- tag-aware / priority-aware Search changes
- hourly time-block grid
- elapsed-time tracking (optional planned Task duration is supported)
- comments / collaboration
- accounts / backend / cloud sync
- AI planning
- integrations
- inline image/PDF attachment preview

## Brand reference

The UI follows the supplied Universal Brand Design System v1: dark technical foundation, electric-blue actions/focus, mint positive states, restrained semantic color, Space Grotesk + Geist typography direction, Phosphor icon direction, approved sidebar geometry and precise motion/reduced-motion behavior.

## Codex / agent handoff

For Codex or another coding agent, start with:

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/codex/PRODUCT_BRIEF.md`](docs/codex/PRODUCT_BRIEF.md)
3. [`docs/codex/V1_3_SCOPE.md`](docs/codex/V1_3_SCOPE.md)
4. [`docs/codex/TASKS.md`](docs/codex/TASKS.md)
5. [`docs/codex/ACCEPTANCE.md`](docs/codex/ACCEPTANCE.md)

The detailed approved V1.3 spec and implementation plan remain under `docs/superpowers/`.
