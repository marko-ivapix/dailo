# Task 3 — Shared IndexedDB V3 storage report

## RED evidence

### Storage contract

Command:

```text
node --test tests/storage-v1-3.test.js
```

Before `js/storage.js` existed, the test runner failed as expected with:

```text
Error: Cannot find module '../js/storage.js'
```

This proves the new storage contract was not accidentally satisfied by the V1.2 attachment adapter.

### V1.2 attachment return compatibility

After the shared adapter existed, the V1.2 facade return-value test was added before its compatibility wrapper changed. The focused command produced 4 passes and 1 expected failure:

```text
AssertionError [ERR_ASSERTION]: Values have same structure but are not reference-equal
```

The failure showed `TodoAttachments.put(record)` returned a cloned stored record rather than the original record, unlike the V1.2 API.

## GREEN evidence

Focused storage/syntax verification:

```text
node --test tests/storage-v1-3.test.js && node --check js/storage.js && node --check js/attachments.js
```

Result: 5 passes, 0 failures; both syntax checks passed.

Combined storage and core regression:

```text
node --test tests/storage-v1-3.test.js tests/core.test.js tests/core-v1-3.test.js
```

Result: 36 passes, 0 failures.

Browser regressions:

```text
PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-2-lifecycle.py
PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-2-smoke.py
```

Result: both exited 0. Chromium required the permitted unsandboxed browser launch on this host; the regular sandboxed launch aborted before opening a page.

## Changed files

- `js/storage.js` — V3 shared IndexedDB adapter and in-memory test adapter.
- `js/attachments.js` — V1.2-compatible facade over `TodoStorage.attachments`.
- `index.html` — loads `storage.js` before the attachment facade.
- `tests/storage-v1-3.test.js` — storage and facade behavioral contracts.
- `tests/ui-v1-2-smoke.py` — browser bootstrap loads storage before attachments.
- `tests/ui-v1-2-lifecycle.py` — browser bootstrap loads storage before attachments.

## Decisions

- `todoAppDB` version 1 owns the four V3 stores: `attachments`, `habitLogs`, `goalHistory`, and `recoverySnapshots`.
- Required indexes are created on upgrade: attachment `taskId` and `pendingDeleteUntil`; Habit `habitId`, `date`, and unique compound `habitDate`; Goal History `goalId` and `createdAt`; Recovery Snapshot `createdAt`.
- The memory adapter uses the same asynchronous namespace APIs as IndexedDB and enforces Habit's unique `(habitId, date)` invariant.
- `TodoAttachments` retains its V1.2 methods and returns the original record from `put`, while its durable data is now in the shared attachment store.
- `migrateLegacyAttachments(taskAttachmentIds)` reads only referenced records from `todoAppAttachments`, skips IDs already copied, and closes but never deletes the legacy database.

## Concerns

None. Migration is intentionally exposed as a storage primitive; startup orchestration is assigned to the later migration/safety work.

---

## Fix round 1 — complete browser bootstrap dependency chain

### RED evidence

Before the bootstrap change, `tests/ui-v1-1-smoke.py` and `tests/ui-v1-3-migration.py` loaded only `core.js` and `app.js`. Runtime assertions for `TodoStorage`, `TodoAttachments`, and `TodoBackup` were added before adding the omitted scripts.

The first focused execution was blocked at Chromium launch by the sandbox (`TargetClosedError`, SIGABRT) before a page could run the new assertion. This was an environment failure rather than a passing pre-change contract. The same browser command succeeds when Chromium is allowed to launch outside the sandbox.

### GREEN evidence

All four Playwright bootstraps now load the production chain after JSZip:

```text
core → storage → attachments → backup → app
```

Each explicitly enables the existing in-memory IndexedDB adapter before script injection so the original V1.1 and V1.3 migration test purposes remain isolated from persisted browser state.

Commands:

```text
PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-1-smoke.py
PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-3-migration.py
PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-2-lifecycle.py
PYTHONPATH=tests/browser_test_support .venv/bin/python tests/ui-v1-2-smoke.py
```

Result: all four browser suites exited 0 with the permitted browser launch.

```text
node --test tests/storage-v1-3.test.js tests/core.test.js tests/core-v1-3.test.js
```

Result: 36 passes, 0 failures.

### Real IndexedDB test note

No additional real-IndexedDB schema test was added in this narrow bootstrap repair. Node reports `indexedDB` unavailable, while the Playwright suites deliberately select the memory adapter for deterministic isolation. A real-browser IndexedDB test would require a new persistent-browser fixture and expands beyond the review finding; the shared storage's memory contract and the existing browser regressions remain covered.
