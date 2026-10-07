# Claude Code continuation handoff

**Updated:** 2026-10-07  
**Product:** Dailo local-first productivity prototype  
**Current release:** V1.7 stabilization (behavior baseline)  
**In the working tree:** V1.8 Quiet Graphite / Swiss Compact visual redesign — implemented, automated checks green, uncommitted, not packaged, native visual acceptance manual-pending

This is the shortest reliable handoff for continuing the project in Claude Code. Read it after `AGENTS.md` and before opening individual modules.

## Where to work

Use the repository root that contains `index.html`, `css/`, `js/`, `tests/` and `docs/`. In the original workspace this is the isolated worktree:

```text
todo-app-prototype-v1.3/.worktrees/todo-v1-3
```

The directory name is historical; the behavior is V1.7 and the visual layer is V1.8. Do not switch to the parent archive, the V1.2 folder or a distributable ZIP when making source changes.

The last verified source checkpoint before this documentation sync was `5b1b8f6`. Always inspect `git status`, `git log -1` and the actual files before relying on that checkpoint.

## Current status

- V1.7 stabilization is implemented in the source tree.
- The release artifact is `Dailo-v1.7-distributable.zip`.
- The recorded SHA-256 is `a322d4a854b1171b088e10759af5310a5e0c4d54d00bff46aad1a746ef61f85d`.
- The release contains 42 regular ZIP files and passed `unzip -t`.
- V1.8 visual redesign is implemented in the working tree (2026-10-07). The three earlier boards were never stored in the repository; no direction was selected, so the brief's default **Quiet Graphite / Swiss Compact** was specified in `docs/superpowers/specs/2026-10-07-todo-v1-8-design.md` and implemented per `docs/superpowers/plans/2026-10-07-todo-v1-8.md`. Evidence per phase is in `docs/superpowers/progress-v1-8.md`.
- V1.8 changes are presentation-only: `css/styles.css` (top `:root` token system with every V1.7 token kept as an alias, plus one appended `V1.8 Quiet Graphite / Swiss Compact` layer organized by surface, with the phone touch-target guard kept as the final rule), `index.html` (title/theme color), `js/app.js` (brand tooltip string; loading-surface `role="status"`/`aria-busy`/indicator), `js/tasks-ui.js` (one inline style replaced by a class) and `tests/design-v1-8.test.js`. `js/core.js`, `js/storage.js`, `js/backup.js`, `js/attachments.js` and all Search code are unchanged.
- The V1.8 work is **not committed** and no V1.8 distributable has been built; `Dailo-v1.7-distributable.zip` remains the latest package.

## Verified automated baseline

Run from the repository root:

```bash
node --test tests/*.test.js
for file in js/*.js vendor/*.js tests/*.js; do node --check "$file"; done
python3 - <<'PY'
import ast, pathlib
paths = sorted(pathlib.Path('tests').glob('*.py'))
for path in paths:
    ast.parse(path.read_text())
print(f'python AST: {len(paths)} files passed')
PY
./.venv/bin/python tests/test_browser_path_adapter.py
./.venv/bin/python tests/test_browser_regression_registry.py
python3 tests/run-browser-regressions.py --dry-run
git diff --check
```

The verified V1.8 working-tree baseline (2026-10-07) is:

| Check | Result |
| --- | ---: |
| Node suite | 288 passed, 0 failed, 0 skipped (V1.7: 251; +37 V1.8 design contracts) |
| JavaScript syntax | 53 files passed |
| Python AST | 19 files passed |
| Browser-path adapter | 2/2 passed |
| Browser-regression registry | 3/3 passed (invoke the three test functions explicitly — the file has no `__main__`, so running it directly executes 0 tests and exits 0) |
| Static browser contracts | 10/10 passed (`--dry-run`) |
| Diff whitespace | passed |

These checks do not prove native browser layout, touch, file chooser, IndexedDB reload or accessibility behavior.

## Honest acceptance boundary

Native browser acceptance is **manual-pending**. The maintained Python scenarios are a harness, not evidence that a browser was launched. Do not launch isolated Chromium or modify the user's personal Chrome as part of ordinary implementation work. If a user-owned browser run is later performed, record exactly which scenarios passed in the current progress ledger.

## Product invariants to preserve

- One canonical Task record; Today, Inbox, Upcoming, Anytime, Projects, Tags and Completed are derived views.
- `plannedDate`/`plannedTime` and `dueDate`/`dueTime` stay independent.
- Priority is metadata only; it does not change Search or Today ordering.
- Projects stay flat; Project Area inheritance applies to Project Tasks.
- Goals and Habits keep their documented lifecycle, reciprocal links, history and reminder rules.
- Notes and Resources are separate entity types and share attachment ownership rules.
- Normal deletion is Confirmation → Delete → Snackbar Undo.
- Reset/Replace All require safety ZIP, recovery snapshot, typed `RESET`/`RESTORE`, verification and rollback.
- Search remains unchanged; no bulk action UI is allowed.

## Safe continuation protocol

1. Read `AGENTS.md`, this file and the relevant `docs/claude/` guide.
2. Inspect the actual source and focused tests; do not infer behavior from old chat messages or unchecked V1.3 checklists.
3. For a behavior change, write/update a versioned spec and plan before broad edits.
4. Add a focused failing test, implement the smallest compatible change, then run focused and full checks.
5. Update the matching progress ledger with evidence, not intention.
6. Re-run the release baseline before claiming completion.

## Recommended next work after V1.8

1. **User-owned-browser visual acceptance of V1.8** at desktop (≥1024px), tablet (701–1023px) and phone (≤700px) widths: sidebar expanded/collapsed, bottom navigation + More sheet, Quick Add, Today, Inbox, Task Properties, Calendar Week/Month/Day Detail, Goals, Habits tracker, Areas, Notes/Resources, Templates, Settings, empty/loading/error states, keyboard focus visibility, reduced motion, `prefers-contrast: more` and forced colors. Record exactly what was observed in `docs/superpowers/progress-v1-8.md`.
2. Commit the V1.8 working tree when the user asks, then build and checksum a V1.8 distributable if wanted.
3. Optional follow-up: consolidate the V1.3–V1.7 CSS layers into the V1.8 token system once a visual baseline exists (deferred deliberately in V1.8 to avoid unverified layout regressions).

Keep behavior and persistence unchanged in visual work. Do not mix a visual change with a schema or Search change unless a new approved spec explicitly requires it.

## Suggested Claude Code opening prompt

```text
Continue Dailo from the current V1.7 source tree. Read AGENTS.md, CLAUDE.md and docs/claude/CONTINUATION.md first. Inspect source/tests before changing anything. Native browser acceptance is manual-pending; do not claim it from static checks. Preserve Search, no-bulk-actions, local-first storage, delete/Undo and typed RESET/RESTORE invariants. For V1.8, start with a short design/spec decision for the selected visual direction, then implement one surface at a time with focused tests and a final full-suite verification.
```
