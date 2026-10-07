# V1.5 final whole-branch fix round

## Result

All six Important review findings (I1–I6) are addressed, together with M1/M2. Based on incoming HEAD `32a816e`; no browser launch, personal Chrome, merge or push was attempted. Native browser acceptance remains pending, not green.

## Changes and evidence

- **I1:** Preserve Today heading/context, insert cards in intended order, and honor pinned-first grouping. Up/Down moves within the visible pinned/unpinned group. A DOM-compatible sibling-order regression covers preamble, saved order, both directions, pinned styling and movement around a pinned card.
- **I2:** Derive timed blocks solely from visible canonical Calendar Task entries. Week and Day Detail regressions verify hidden Tasks remain absent and visible same-day planned/due metadata survives.
- **I3:** Scheduled Tasks invoke the existing reciprocal Goal synchronization before persistence. A generated Task's completion now produces 100% linked Goal progress; repeat calls and a serialized/reloaded marker do not duplicate it.
- **I4:** Selective Goal restore reconciles only its membership on affected existing Tasks, Projects and Habits, both additions and removals, without replacing unrelated metadata or other Goal memberships. Candidate validation and existing restore/Undo transaction machinery remain in use.
- **I5:** Scheduler runs after saving a due schedule, during ready startup and on guarded 30-second checks, including day boundaries. One-shot missed-date catch-up uses the scheduled date for variables and offsets. The generation marker identifies that scheduled date; changing the date creates a new one-shot schedule. Recovery/global-operation/loading guards prevent mutation. Failed batch persistence restores Tasks, Goals and generation markers so the next check can retry without duplicates.
- **I6:** Task duration (including Project-template children) and Habit minimum/ideal/grace values survive snapshot creation, template editing/validation, ZIP round trip, instantiation and Habit creation drafts. Positive whole Task durations, fractional numeric Habit targets, whole-count targets and nonnegative whole grace days are validated. Execution IDs, completed status, attachments and Habit history are not copied into instances.
- **M1/M2:** Corrected V1.5 smoke selectors to `.calendar-timed-block`; updated title/sidebar identity to Dailo V1.5 and clarified README schema V3/shared IndexedDB/duration documentation. Packaged README, overview and progress ledger reflect this fix round and catch-up policy.

## Verification

- RED: all 8 new integration groups failed on the reviewed implementation. The additional pinned-group movement assertion also failed before its correction.
- GREEN: `node --test tests/*.test.js` — **146 passed, 0 failed, 0 skipped**. New integration file — **8/8 passed**.
- Full suite includes supported legacy ZIP imports, V1.5 ZIP export/import, exact attachment bytes, snapshot retention, guarded selective restore/Undo and failure rollback regressions.
- `tests/test_browser_path_adapter.py` — **2/2 passed**.
- Python AST parse — **16/16 files passed**; JavaScript syntax — **30/30 files passed**, including runtime modules, vendor and Node tests.
- `git diff --check` — passed.
- Browser limitation unchanged: earlier disposable Chromium launch aborted with SIGABRT/EPERM, then escalation was canceled. No browser cases were rerun or claimed passing in this round. Native IndexedDB/download/visual/accessibility acceptance needs a permitted isolated runtime.

## Rebuilt artifacts

Created after final production files and packaged documentation were complete:

1. Worktree `Dailo-v1.5-distributable.zip`.
2. `/Users/marko.radicevic/Documents/Dailo simple/Dailo-v1.5-distributable.zip`.

Both archives are **235,797 bytes**, byte-identical, and contain **30 files** matching the final source bytes. Both pass `unzip -t` and independent ZIP CRC, exact manifest and safe-path checks. No nested ZIP, tests, Git metadata, review logs or caches are included. Artifacts remain outside version control under the existing ignore rule; source/docs/tests/report are committed.

SHA-256 (both): `a14fa3b17d283d1d090c9dcb5c00dfb44d128ce95f8bc0152de2f2750cf19d1c`.

The report is excluded from the distributable, so recording its digest does not create a self-referential package checksum.

## Minor browser-fixture follow-up

Reset both shared Calendar Task fixtures to Open with a null completion timestamp before Calendar setup, because the preceding Focus flow can complete one of them. Added an explicit open-state assertion before timed-block assertions. Fresh verification remains 146/146 Node tests, 2/2 browser-adapter tests and 16/16 Python AST parses; diff check passed. No browser was launched. Only the excluded test file and this excluded report changed, so both packaged manifests/bytes and the digest above remain unchanged; no ZIP rebuild was needed.
