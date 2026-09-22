# Dailo V1.7 Progress Ledger

**Baseline:** V1.6 `9655b4c`
**Spec:** `docs/superpowers/specs/2026-09-22-todo-v1-7-design.md`
**Plan:** `docs/superpowers/plans/2026-09-22-todo-v1-7.md`

## Status

- [x] Scope approved in chat.
- [x] Design specification written and approved in chat.
- [x] Implementation plan written.
- [x] Isolated worktree verified.
- [x] Task 1 — Mobile More navigation and responsive route access (`aa99ad5`, fix `8daa18d`; implementer + separate review approved).
- [x] Task 2 — Accessibility, keyboard, and overlay hardening (`22b83fb`, fixes `a5f643f`, `9a41484`, `8409a77`, `2c76bc6`, `bca9f3d`; implementer + final review approved).
- [x] Task 3 — Regression runner and release-evidence coverage (`44d199f`, fixes `867eda0`, `4a13b2b`, `542cd81`, ledger cleanup `0a19c20`; implementer + separate review approved).
- [x] Task 4 — Recurrence, validation, and Goal-link integrity (`2c169e3`, compatibility fix `50803a5`; implementer + final review approved).
- [ ] Task 5 — Backup, restore, snapshots, and multi-tab safety.
- [ ] Task 6 — Targeted responsive polish and documentation.
- [ ] Task 7 — Integration, packaging, and final whole-branch review.

## Evidence log

Task 1 evidence: navigation tests 6/6, existing modal/compact regressions 7/7, JS syntax check and `git diff --check` passed. More navigation is available through the tablet/mobile breakpoint, includes all secondary routes, traps focus, closes on Escape, restores opener focus, and leaves Search/desktop/no-bulk behavior unchanged.

Task 4 evidence: 155/155 affected tests passed in final review. Core/backup reject cross-collection IDs and impossible/non-empty invalid metadata timestamps, reciprocal Goal-link repair is idempotent and observable through import warnings, ambiguous contribution links fail without inventing settings, DST coverage is deterministic, and selective restore error semantics remain compatible.

Task 2 evidence: final review exercised nested and rerendered popover focus, duplicate background/modal selectors, hidden property fallback, Areas tab rerender focus, custom popover labels/initial focus, and no-op close behavior. Full suite: 224/224 passed; syntax and diff checks passed.

Task 3 evidence: final review verified Python AST parsing **21/21**, V1.6 static contracts **10/10**, registry checks **3/3**, browser path-adapter checks **2/2**, deterministic `--list`/`--dry-run` output, exact mocked failure context, and `git diff --check`. V1.5 browser fixtures use fixed dates and four explicit open tasks; V1.6 mobile/touch acceptance remains explicitly pending-manual.

Task 3 runner evidence: the standard registry now enumerates V1.1, V1.2, V1.3, V1.5, and V1.6 groups with scenario names matching the maintained scripts. V1.5 fixtures use a fixed clock and explicit IDs; V1.6 mobile/compact entries are static contracts with acceptance marked pending-manual. `tests/run-browser-regressions.py --list` and `--dry-run` provide deterministic registry checks without launching a browser; native browser acceptance remains pending.

The V1.6 baseline remains 207/207 automated tests. After Tasks 1–4 and accessibility hardening, the current full Node suite is 224/224 passing. Native browser acceptance remains pending.

## Manual browser gate

Pending user-owned-browser verification. No isolated Chromium or personal Chrome was opened by the implementation workflow.
