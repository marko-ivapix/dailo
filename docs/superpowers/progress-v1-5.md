# V1.5 progress ledger

## Integration status — 2026-09-17

- Tasks 1–8 are implemented on the V1.5 branch.
- Node suite after the final review fixes: **146 passed, 0 failed, 0 skipped**. The 8 new integration test groups first reproduced the review defects, then passed against the fixes.
- Every JavaScript file under `js`, `vendor` and `tests` passed `node --check`; `git diff --check` passed. Browser path-adapter tests passed **2/2**; all Python test files parsed successfully.
- V1.1–V1.4 browser regressions and V1.5 browser coverage are intentionally not claimed here: this environment blocks the isolated browser runtime. Personal Chrome was never opened.
- The V1.5 distributable ZIP contains only `index.html`, README/overview, CSS, JavaScript, vendor assets, and user-relevant docs/requirements. It is written to both the worktree root and `/Users/marko.radicevic/Documents/Dailo simple/Dailo-v1.5-distributable.zip`, then checked with `unzip -t`.

## Final whole-branch review fixes

- I1: Today header/context stay first; saved order and Up/Down are correct. Pinned cards appear first, with moves bounded to the same pinned/unpinned group.
- I2: Week and Day Detail timed blocks use the visible Calendar task projection, retain planned+due metadata, and do not reintroduce hidden tasks or conflicts.
- I3: Generated scheduled Tasks synchronize Goal-owned links before saving, so linked Goal progress includes them.
- I4: Selective Goal restore reconciles additions/removals on existing Task/Project/Habit memberships, preserving unrelated fields and Goal links. Existing safety ZIP, confirmation, validation and Undo paths are unchanged.
- I5: Due schedules run after saving, at ready startup and on guarded 30-second checks including date changes. Missed one-shot dates catch up once; dates/variables stay anchored to the scheduled day. Recovery/startup/global-operation guards prevent premature mutation. A failed generated-batch save restores Tasks, Goals and generation markers for retry.
- I6: Task duration (including Project children) and Habit minimum/ideal/grace settings survive template snapshot, editor validation, ZIP round trip, instantiation and creation drafts. Instances do not inherit execution identity/history.
- M1/M2: The V1.5 browser smoke now uses the actual timed-block CSS selector. In-app identity says Dailo V1.5; README storage version/database and duration exclusions now describe the current build.
- Both packages were rebuilt only after production files and packaged docs were final: **30 files**, no nested ZIP, test files, Git metadata, review logs, caches or unsafe paths; CRC/integrity and every source-file byte comparison passed. The copies are identical. Artifact digest is recorded in the excluded fix-round report to avoid a self-referential packaged checksum.

## Deferred hardening

## Post-release compactness/math fix — 2026-09-17

- Habit dashboard percentages now count only eligible past scheduled units; `timesPerWeek` habits are scored against their weekly target instead of visible day cells. Added regression coverage for daily 7/17 and weekly target math.
- Task properties disclosure is closed by default and toggles natively on its summary click. Task modal and global layout spacing were tightened for a denser workspace.
- Mobile Quick Add is explicitly closed on initialization and `[hidden]` is enforced in CSS, so the action circles open and close only from the plus control. Habit day cells suppress stray fallback text.
- Verification after the fix: **147 passed, 0 failed, 0 skipped**; JavaScript syntax, Python AST and `git diff --check` passed. The updated distributable ZIP was rebuilt and passed `unzip -t`.

- Run the isolated Playwright/browser regression set in a permitted runtime before release-quality sign-off.
- The prior isolated Chromium attempt aborted with SIGABRT/EPERM; the escalation request was canceled. No browser launch was attempted in this fix round. No native browser case is newly claimed as passing.
- Complete visual/accessibility inspection in that same isolated browser runtime.
