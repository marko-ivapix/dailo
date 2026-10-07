# Task 7 report — Backup, selective recovery and polish

## Status

Implementation complete with deterministic verification. Browser migration/safety, visual and reduced-motion runtime acceptance remain pending under the known sandbox restriction; no additional browser launches were attempted.

## Changes

- Successful saves and startup schedule an automatic snapshot after one idle second, at most every five minutes. Five recent automatic copies are retained. Operation-recovery snapshots are excluded from automatic pruning.
- Snapshots contain normalized compact metadata, attachment bytes, Habit logs and Goal history. Storage/capture failures retain existing copies and surface a distinct retry message.
- Settings → Data → Local snapshots shows loading/error/empty states and one-entity restore controls.
- Selective restore builds a candidate containing the current workspace plus the selected entity and its owned files/history. It validates snapshot data before normalization, checks dependencies and ownership, and preserves unrelated records. It supports Tasks, Projects, Areas, Tags, Goals, Habits, Notes, Resources, Templates and Saved Views.
- Selective replacement shares the full-restore safety ZIP, internal recovery copy, typed RESTORE confirmation, source checks, native record replacement, verification and rollback pipeline. Full RESET/RESTORE behavior and earlier ZIP versions remain intact.
- A retained safety copy provides snackbar Undo while data is unchanged after restore. Later edits cause Undo to refuse rather than overwrite them. Its retained copy remains selectable; failed rollback keeps recovery available. Cleanup failure after a verified Undo remains classified as cleanup, not failed data restoration.
- Unsaved-state and automatic-snapshot errors have separate messaging and Retry controls. Existing reduced-motion CSS now also removes animation/transition delays.
- README and Serbian project overview describe V1.5, recovery use and verification limits.

## TDD and verification

- RED: four storage/selection tests initially failed for missing snapshot and selective restore functions; two UI tests failed for missing recovery and error-state renderers.
- GREEN: focused recovery/UI suite passed 11/11.
- Additional RED/GREEN checks reproduced malformed metadata being normalized away and Undo cleanup failures being misclassified, then verified the corrected behavior.
- Integration tests execute the application's real safety/restore functions with the real storage/backup modules using disposable in-memory storage. They verify safety ZIP contents, the typed confirmation gate, restored attachment bytes, Undo bytes, rollback after a denied metadata commit, refusal after subsequent edits, and retained-copy cleanup failure behavior.
- `node --test tests/*.test.js`: 135 passed, zero failed; includes existing migration, ZIP import and storage safety coverage.
- `node --check js/app.js`, `js/backup.js`, `js/storage.js`, `js/settings-ui.js`: passed.
- `git diff --check`: passed.

## Boundaries and remaining acceptance

- Native IndexedDB/browser migration, complete browser safety suite, visual inspection and computed reduced-motion checks were not rerun because localhost/browser execution was previously blocked. In-memory test evidence is not equivalent to native-browser verification.
- Selective recovery does not silently restore dependencies or children. Missing referenced entities must be restored first. Task/Project/Habit restore reconciles only the selected entity's reciprocal links on existing Goals; Area/Project restore does not restore every historically linked child.
- Undo is intentionally guarded against all subsequent saved metadata/native-data changes. If it becomes unsafe, use the retained safety copy for another selective restore.
- Automatic copies use browser storage quota and run only while the app is open; portable exported ZIPs remain necessary for device/browser loss.

## Important review fix — reciprocal Goal relationships

- Restoring a Task, Project or Habit now adds/removes its corresponding Goal-owned links to match the restored entity's `goalIds`, without replacing current Goal metadata or unrelated contributions.
- Project and Habit links recover the saved contribution mode/Task selection or metric/target. Missing saved reciprocal settings or selections incompatible with current Tasks reject before any writes; linked dependencies are never silently resurrected or moved.
- RED: three focused regressions failed because restored membership was absent from Goal-owned links. GREEN: all three pass, proving both membership sides, computed Goal progress, preservation of unrelated Goal fields/current state, missing-setting rejection and incompatible Project selection rejection.
- Fresh full verification: `node --test tests/*.test.js` passed **138/138**; focused recovery/UI coverage passed **14/14**. Syntax checks for app, backup, storage and settings UI plus `git diff --check` passed. Browser acceptance remains pending; no browser attempts were made for this fix.
