# Claude documentation index

These files are the current implementation handoff for Claude and other agents. They were synchronized on 2026-10-08 against the V1.12 source, tests and progress ledgers (V1.10 Smart Quick Add at `c64bd81`, V1.11 Weekly review at `5bbd820` and V1.12 Duration and time-blocking at `d00855b`, pending merge into `main` together through one PR; V1.9 merged through PR #5 and V1.9.1, which completes its Step 7, through PR #6).

| File | Use it for |
| --- | --- |
| `CONTINUATION.md` | Current handoff, verified baseline, honest acceptance boundary and next-work protocol |
| `PROJECT_MAP.md` | File/module inventory and where to start a change |
| `ARCHITECTURE.md` | Boot, adapter dispatch, localization, service worker, data protection, Quick Add parsing, weekly review, time-blocking and capacity, rendering, events and derived views |
| `DOMAIN_MODEL.md` | Entity shape, relationships, lifecycle and invariants |
| `FEATURES.md` | Current feature inventory, evidence and stale-summary warnings |
| `DATA_AND_RECOVERY.md` | localStorage, IndexedDB, migration, backup and rollback |
| `TESTING_AND_RELEASE.md` | Commands, exact release counts, the release-test version convention, packages (`Dailo-v1.12-distributable.zip` recipe and dry run; V1.9.1 previous) and browser limits |
| `WORKING_RULES.md` | Safe editing, scope, i18n rules, verification and documentation vocabulary |

Start at the repository root [`CLAUDE.md`](../../CLAUDE.md), then read `CONTINUATION.md` and the relevant guides before editing code. `AGENTS.md` remains the governing project policy. The V1.7 spec, plan and progress ledger are the current behavior references; the V1.8 spec (`docs/superpowers/specs/2026-10-07-todo-v1-8-design.md`), plan and ledger (`docs/superpowers/progress-v1-8.md`) are the current visual-design references; the V1.9 spec (`docs/superpowers/specs/2026-10-07-todo-v1-9-design.md`), plan and ledger (`docs/superpowers/progress-v1-9.md`) cover install, offline, data protection, the Serbian UI and the release/problem-report work; the V1.10 spec (`docs/superpowers/specs/2026-10-08-todo-v1-10-design.md`), plan and ledger (`docs/superpowers/progress-v1-10.md`) cover Smart Quick Add; the V1.11 spec (`docs/superpowers/specs/2026-10-08-todo-v1-11-design.md`), plan and ledger (`docs/superpowers/progress-v1-11.md`) cover the weekly review; the V1.12 spec (`docs/superpowers/specs/2026-10-08-todo-v1-12-design.md`), plan and ledger (`docs/superpowers/progress-v1-12.md`) cover duration and time-blocking. The release path after V1.9 is `docs/superpowers/plans/2026-10-07-release-roadmap.md` (Phase 4, V1.10–V1.12, done). The V2.0 spec `docs/superpowers/specs/2026-10-08-todo-v2-0-design.md` (mobile app + Supabase sync) is a draft awaiting the user's decisions; the `AGENTS.md` no-backend rule still applies until it is approved. The Serbian beta checklist is `docs/beta/provera-pre-bete.md` (B1–B30) and the tester guide is `uputstvo.html`; both are Serbian by design, like `PROJECT_OVERVIEW.md`. Versioned specs and plans remain authoritative for approved scope; current source/tests remain authoritative for what is actually implemented.

Status labels used throughout:

- **Implemented** — present in the current source.
- **Automated-tested** — covered by a named local command/test.
- **Manual-pending** — requires a real browser/device demonstration.
- **Deferred** — intentionally outside the prototype scope.
