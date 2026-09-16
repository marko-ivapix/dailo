# To Do — HTML Prototype v1.2

Desktop-first functional prototype for a personal/freelancer task tracker. The product keeps a simple workflow:

**Capture → Organize → Plan → Complete**

`plannedDate` means when you intend to work on a task. `dueDate` is its deadline. A task exists once; Today, Inbox, Upcoming, Anytime, Projects, Tags and Completed are derived views over the same task data.

## Run

This is a static HTML/CSS/vanilla JavaScript prototype. Serve the folder with a small local web server:

```bash
cd todo-app-prototype-v1.2
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

Space Grotesk, Geist and Phosphor icon styles are referenced from public CDNs. The application itself has no backend or account requirement.

## What is included

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

### V1.2 — Tags

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

### V1.2 — Priority

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

### V1.2 — Attachments

Attachments are real local files stored as Blobs in IndexedDB.

- Task Detail only; Quick Add remains lightweight
- Add through file picker or drag & drop
- All file types allowed
- Maximum **10 MB per file**
- Maximum **10 attachments per task**
- File name, type and size are shown
- Open / Download / Delete actions
- Attachment Delete + Undo restores the same attachment ID and Blob
- Task Delete + Undo preserves/restores all referenced files during the Undo window
- Expired pending deletions are cleaned from IndexedDB

Binary files never enter localStorage.

### V1.2 — Duplicate task

Duplicate copies task metadata and creates independent subtask IDs.

If the task has attachments, the user chooses:

```text
Cancel | Without files | Copy files
```

`Copy files` creates independent attachment records with new IDs and new task ownership. A failed multi-file copy rolls back partial attachment copies and does not create a half-finished duplicate task.

### V1.2 — Faster planning

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

V1.2 uses a hybrid local storage model.

### localStorage

Key:

```text
todoAppData
```

Schema version:

```text
version: 2
```

Stores task/project/tag/settings/UI metadata. V1.1 `version: 1` state is migrated to v2 on load with these new defaults:

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
todoAppAttachments
```

Object store:

```text
attachments
```

Each attachment record contains its ID, task ownership, file metadata, Blob, timestamps and optional pending-delete timestamp.

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
node --test tests/core.test.js
.venv/bin/python tests/test_browser_path_adapter.py
.venv/bin/python tests/run-browser-regressions.py
```

Syntax checks:

```bash
node --check js/core.js
node --check js/attachments.js
node --check js/backup.js
node --check js/app.js
```

The browser harness uses an in-memory test adapter for attachment storage because this execution environment blocks normal browser origins. Production code defaults to the real IndexedDB adapter; the in-memory path is enabled only by the test-only `window.__TODO_TEST_MEMORY_DB__` flag.

## Still intentionally excluded

- bulk actions
- tag-aware / priority-aware Search changes
- calendar view
- time estimates / time tracking
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
