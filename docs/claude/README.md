# Claude documentation index

These files are the current implementation handoff for Claude and other agents. They are derived from the V1.6 source, tests and release evidence on 2026-09-18.

| File | Use it for |
| --- | --- |
| `PROJECT_MAP.md` | File/module inventory and where to start a change |
| `ARCHITECTURE.md` | Boot, adapter dispatch, rendering, events and derived views |
| `DOMAIN_MODEL.md` | Entity shape, relationships, lifecycle and invariants |
| `FEATURES.md` | Current feature inventory, evidence and stale-summary warnings |
| `DATA_AND_RECOVERY.md` | localStorage, IndexedDB, migration, backup and rollback |
| `TESTING_AND_RELEASE.md` | Commands, exact release counts, package and browser limits |
| `WORKING_RULES.md` | Safe editing, scope, verification and documentation vocabulary |

Start at the repository root [`CLAUDE.md`](../../CLAUDE.md), then read these guides before editing code. `AGENTS.md` remains the governing project policy. Versioned specs and plans remain authoritative for approved scope; current source/tests remain authoritative for what is actually implemented.

Status labels used throughout:

- **Implemented** — present in the current source.
- **Automated-tested** — covered by a named local command/test.
- **Manual-pending** — requires a real browser/device demonstration.
- **Deferred** — intentionally outside the prototype scope.
