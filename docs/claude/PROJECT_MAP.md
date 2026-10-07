# Current implementation project map

This map describes the source inspected on 2026-10-07. It is an onboarding aid for Claude, not a replacement for `AGENTS.md`, the versioned specifications, or acceptance evidence. The directory name still says V1.3; README describes V1.7 functionality. Inspect source before making version or completion claims.

## Runtime files

| File | Current responsibility |
| --- | --- |
| `index.html` | Static shell: desktop sidebar, responsive mobile bottom navigation, main content, floating Quick Add/capture controls, modal and toast roots; loads styles and ordered classic scripts. |
| `css/styles.css` | Shared application styling. The top `:root` block is the V1.8 Quiet Graphite token system (primitives, semantic roles, every V1.7 token name kept as an alias). Historical V1.3–V1.7 rule layers follow, then one appended `V1.8 Quiet Graphite / Swiss Compact` layer organized by surface; the phone touch-target guard must stay the final rule. Includes responsive desktop/tablet/phone rules, reduced motion, `prefers-contrast` and forced-colors support. There is no component CSS build pipeline. |
| `vendor/jszip.min.js` | Vendored JSZip 3.10.1; supplies `JSZip` for local ZIP export/import. |
| `js/core.js` | `TodoCore`: normalization, V3 migration/validation, task/date rules, derived views, Goal contributions, Habit schedules/metrics, templates and newer planning/insight calculations. Also exports CommonJS for Node tests. |
| `js/storage.js` | `TodoStorage`: IndexedDB access, attachment ownership, legacy-file migration, Habit logs, Goal history, migration/recovery snapshots, validated data replacement and verification. Also supports CommonJS/test memory storage. |
| `js/attachments.js` | `TodoAttachments`: compatibility facade over `TodoStorage.attachments`; adds guarded owned writes and rollback of a file written for a stale owner. It is not another file database. |
| `js/backup.js` | `TodoBackup`: ZIP creation/inspection, manifest/domain/file validation, older-format compatibility, selective-restore preparation and storage-backed restore. Format version and application schema version are distinct. |
| `js/domain-modules.js` | `TodoDomainModules`: ordered adapter registry; rejects duplicate adapter names. |
| `js/knowledge.js` | Registered knowledge adapter: Note/Resource lists and details, edit drafts, filters/favorites, links, resource metadata and attachment UI. |
| `js/goals-ui.js` | Goals adapter: horizon/list/detail/row rendering, property editing, milestones, links, reminders, reached-goal decision and history panels. |
| `js/habits-ui.js` | Habits adapter: routines, tracker/detail/row rendering and editor/settings/finished panels; invokes app-owned history and metric operations. |
| `js/saved-views-ui.js` | Saved Views adapter: task/goal/habit filters, list/detail and editing; app context supplies persistence and shared actions. |
| `js/projects-ui.js` | Projects adapter: active/archive lists, project detail and editor; shared task actions and persistence remain in app context. |
| `js/areas-ui.js` | Areas adapter: list/detail/editor, linked records and contextual creation. |
| `js/settings-ui.js` | Settings adapter: preferences, shortcuts, Today personalization and local-data/recovery controls. Many operations are supplied by app context. |
| `js/templates-ui.js` | Templates adapter: typed template list/editor and source snapshots; app owns instantiation and scheduled-task execution. |
| `js/calendar-ui.js` | Calendar adapter: Week/Month and date panels based on shared records; routes calendar quick actions to app helpers. |
| `js/tasks-ui.js` | Tasks adapter: reusable task rows, Task detail modal and task-property input/action handlers. Today/Inbox/Upcoming screens are still in `app.js`. |
| `js/cleaning-ui.js` | Cleaning adapter: room/chore screens, forms and explicit apartment/house presets. Rooms are Projects marked `isCleaningRoom`; chores are ordinary Tasks in those Projects. |
| `js/app.js` | Composition root and central controller: state loading/saving, hash routes, desktop sidebar and mobile bottom navigation, daily task screens, adapter context/dispatch, capture/Search, responsive Quick Add, overlays, delegated events, reminders, recurring completion, Undo/delete lifecycle, backups/recovery and automatic/scheduled work. It remains a large controller; adapter extraction is partial. |

## Read paths for changes

- Task membership or ordering: start in `core.js`, then inspect `app.js` daily-view/render/action helpers and `tasks-ui.js`.
- Goal/Habit UI: start in the corresponding adapter; inspect app context and `core.js` rules before modifying links or history.
- Persistence, deletion, migration or recovery: inspect `storage.js`, `backup.js` and the coordinating lifecycle in `app.js` together.
- Notes/Resources: inspect `knowledge.js`, shared ownership in `storage.js`, backup validation and app attachment operations.
- Cleaning: inspect `cleaning-ui.js` and shared Project/Task behavior; there is no separate room/chore collection.
- Styling: inspect `styles.css` and the markup generated by the responsible adapter/controller, including mobile and overlay states.

## Tests and documentation

`tests/*.test.js` uses Node's built-in test runner. The current tree has 35 Node test files (including `tests/design-v1-8.test.js`, the V1.8 visual contracts), 17 runtime JavaScript modules and 19 Python test/helper files. Some tests import pure modules; others evaluate selected app/controller code in VM contexts with test doubles or inspect source/CSS. Those checks do not establish real browser behavior. Files carry historical version suffixes and remain regression coverage, not independent applications.

`tests/ui-*.py` contains browser scenarios. `tests/browser_test_support/` contains the test-only path adapter and `sitecustomize.py`; `tests/test_browser_path_adapter.py` checks the adapter. `tests/run-browser-regressions.py` enumerates maintained V1.1/V1.2/V1.3/V1.5/V1.6 groups and labels static versus manual-browser entries. V1.7 release coverage is primarily in the Node/static suites and the V1.7 progress ledger. Browser prerequisites are in `requirements-browser-tests.txt` and README. There is no root `package.json`; the Node suite is invoked directly with `node --test tests/*.test.js`.

`README.md` explains running the prototype, features and verification limitations. `PROJECT_OVERVIEW.md` is a Serbian product overview with explicitly labeled brainstorming questions; those questions are not accepted requirements. `docs/codex/` holds product/scope/checklists; `docs/superpowers/` holds versioned specs, plans and progress evidence. Follow `AGENTS.md` precedence when changing behavior, and distinguish historical requirements from current implementation.

## External assets

Google Fonts supplies Geist and Space Grotesk. Phosphor icon styles are referenced from unpkg at 2.1.1. JSZip is local. No backend/account/cloud-sync integration is implemented by these runtime files; CDN fonts/icons may still require network access.
