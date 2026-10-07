# Dailo V1.8 Progress Ledger

**Baseline:** V1.7 `5b1b8f6` + uncommitted 2026-10-07 documentation sync
**Spec:** `docs/superpowers/specs/2026-10-07-todo-v1-8-design.md`
**Plan:** `docs/superpowers/plans/2026-10-07-todo-v1-8.md`
**Direction:** Quiet Graphite / Swiss Compact (defaulted; the three earlier boards are not in the repository)

## Status

- [x] Baseline re-verified before any change (2026-10-07).
- [x] V1.8 design spec written.
- [x] V1.8 implementation plan written.
- [x] Phase 1 — Design tokens and global density
- [x] Phase 2 — Desktop shell and sidebar
- [x] Phase 3 — Mobile navigation and Quick Add
- [x] Phase 4 — Today and Inbox
- [x] Phase 5 — Task Properties modal and overlays
- [x] Phase 6 — Calendar
- [x] Phase 7 — Goals and Habits
- [x] Phase 8 — Areas, Projects, Notes and Resources
- [x] Phase 9 — Templates, Settings and More
- [x] Phase 10 — Empty, loading, error, focus and reduced motion
- [x] Final verification and handoff docs
- [x] V1.8 distributable packaged (2026-10-07)

## Baseline evidence (before V1.8 changes)

| Check | Result |
| --- | ---: |
| `node --test tests/*.test.js` | 251 passed, 0 failed, 0 skipped |
| JavaScript syntax (`js/*.js vendor/*.js tests/*.js`) | 52/52 |
| Python AST (`tests/*.py`) | 19/19 |
| `tests/test_browser_path_adapter.py` | 2/2 |
| `tests/test_browser_regression_registry.py` | 3/3 (test functions invoked explicitly — the file has no `__main__`, so running it directly executes 0 tests and exits 0) |
| `tests/run-browser-regressions.py --dry-run` static contracts | 10/10 (2 + 3 + 5) |
| `git diff --check` | passed |

## Evidence log

_Phase entries are appended below as each phase completes._

**Phase 1 — tokens and global density.** Rewrote the top `:root` block as the Quiet Graphite token system (graphite/line/ink/blue/mint/yellow/red primitives, semantic tints, calendar type rails, type scale, 4/6/8/12/16 radius scale, overlay-only shadows, 140/200/260ms motion) with every V1.7 token name kept as an alias. `--focus-ring` is now a 2px canvas gap + 2px `--blue-300` ring (was an 18%-alpha ring). Appended the `V1.8 Quiet Graphite / Swiss Compact` layer with global controls, inputs, page header, section labels, scrollbars and a forced-colors-safe transparent focus outline. Moved the phone touch-target guard (`Keep primary compact actions touchable after all density rules`) to the end of the file so V1.8 rules cannot override it. Files: `css/styles.css`, `tests/design-v1-8.test.js`. Checks: V1.8 contracts 5/5 (5 failed before implementation); full Node 256/256; JavaScript syntax 53/53; static browser contracts 10/10; `git diff --check` passed.

**Phase 2 — desktop shell and sidebar.** Sidebar returns to the 240px/72px brand geometry (removed the V1.5 220px override). Darkest graphite rail with right hairline; 32px nav items with graphite hover/active fill, ink-1 active label, accent icon and a 2px accent marker pseudo-element (drop-target borders untouched); quiet 10px group titles; tabular badges with primary fill when active; square project dots. Version strings updated (document title, brand tooltip) and `theme-color` set to the new canvas. Files: `css/styles.css`, `index.html`, `js/app.js` (tooltip string only), `tests/design-v1-8.test.js`. Checks: V1.8 contracts 7/7 (2 new failed before implementation); full Node 258/258; static browser contracts 10/10; `git diff --check` passed.

**Phase 3 — mobile navigation and Quick Add.** Surface treatment only; display/position stay with the V1.6/V1.7 responsive rules so the bar remains hidden on desktop and the six-column grid, More trigger and Quick Add independence are unchanged. Opaque graphite bottom bar (no blur, no shadow) with a 2px accent indicator on the active route and hover only on hover-capable pointers. More sheet is now flush to the bottom edge, capped at 640px on tablets, with a decorative grabber and 46px route rows. Quick Add toggle becomes a 44px rounded square (12px radius) on the primary fill with a FAB shadow; option labels/icon tiles use graphite panels; menu enters with the existing popover motion (suppressed by reduced motion). Files: `css/styles.css`, `tests/design-v1-8.test.js`. Checks: V1.8 contracts 10/10 (3 new failed before implementation); full Node 261/261; static browser contracts 10/10; `git diff --check` passed.

**Phase 4 — Today, Inbox and shared task rows.** Focus strip becomes one hairline panel with tabular count chips; the empty `.today-context` line no longer leaves a stray rule. Focus/Review/Actions cards share the panel language and pinned cards use an inset 2px accent rail (the `hidden` attribute still controls card visibility). Daily actions are icon-left tiles in an auto-fit grid (one row on desktop, two 44px columns on phones). Task rows: graphite hover with hairline, 11px tabular metadata, mint completion fill with graphite check, line-through for completed titles. Phone completion controls keep their transparent 44px hit area (V1.8 fills apply to the `::before` ring only). Milestone check buttons (`.task-check`, `.check-toggle`, previously unstyled) are 28px controls with a 44px phone hit area via `::after`. Upcoming/Completed day groups use Space Grotesk labels with hairlines. Inbox filters become a segmented control. `js/tasks-ui.js`: one inline style replaced by `class="task-meta-project"` (markup only, no behavior change). Files: `css/styles.css`, `js/tasks-ui.js`, `tests/design-v1-8.test.js`. Checks: V1.8 contracts 15/15 (5 new failed before implementation); full Node 266/266; JavaScript syntax passed; static browser contracts 10/10; `git diff --check` passed.

**Phase 5 — Task Properties, modals and overlays.** Modals are 12px graphite panels with overlay elevation and hairline header/footer; phone bottom sheets (Quick Add, small modals, Task Properties) gain a decorative grabber. Task Properties: essentials chips on graphite with hairlines, 32px disclosure summaries with hover and quiet right-aligned meta, property groups as darker inset wells, ink-3 keys / ink-1 values; Properties, Schedule and Links & notes remain collapsed by default (re-asserted). The summary focus outline is now drawn inside (`outline-offset: -2px`) because `.detail-disclosure` clips overflow — the V1.7 4px offset was being clipped. Popovers use `--shadow-popover`; selected options use border/fill (no box-shadow) so the focus ring stays visible on the initially focused option. Search modal restyled through CSS only (no Search code touched). Toasts carry a 2px mint rail; `role="alert"` toasts (stale tab, recovery retry, failed delete) switch to a warning rail and icon. Tooltips and Focus mode adopt the same language. Files: `css/styles.css`, `tests/design-v1-8.test.js`. Checks: V1.8 contracts 18/18 (3 new failed before implementation); full Node 269/269; static browser contracts 10/10; `git diff --check` passed.

**Phase 6 — Calendar.** Week/Month (`.list-tabs`, previously unstyled) and Template type switches (`.view-tabs`, previously unstyled) share one segmented control. Space Grotesk period label; visibility toggles become hairline pills; summary bar is a panel. Type rails are driven by a `--cal-rail` custom property per item class — tasks `--blue-300`, habits mint, goals neutral `--ink-2` (V1.7 painted tasks and goals the same blue), milestones yellow; conflicts switch the rail to warning and completed items to mint. The rail is a positioned `::before` so it stays visible over the full-bleed open button on hover. Today: 2px accent top marker on the Week column and a primary-filled date chip in Month. Selected cells use fill only, and Month cells/day headings use an inset focus ring because grid neighbours paint over outer rings. Day Detail sections, conflict note and quick-action chips adopt the panel language. Drag targets keep their outline. Files: `css/styles.css`, `tests/design-v1-8.test.js`. Checks: V1.8 contracts 21/21 (3 new failed before implementation); full Node 272/272 (V1.7 narrow-week contracts still green); static browser contracts 10/10; `git diff --check` passed.

**Phase 7 — Goals and Habits.** Goal/Habit group headers become flat bands with a hairline and Space Grotesk group names (no double rule between groups). Rows share the 8px graphite card; goal statuses become uppercase hairline micro-pills. Fixed a V1.7 specificity gap: `.goal-row small` outranked `.goal-status--completed/--paused/--archived`, so rows never showed those colors; V1.8 scopes the modifiers to rows. Progress bars are 4px with the accent fill (the Today Goals override previously used the low-contrast `--primary`) and turn mint for completed goals via `:has()` (progressive enhancement; falls back to accent). Overdue/done/missed rails are positioned `::before` elements so the inner button hover fill no longer hides them. Monthly tracker keeps its 20×22 cell geometry; state colors now derive from tokens instead of three slightly different hard-coded mint/red values; hover no longer shifts cells. Dashboards, analytics, heatmaps, history and milestones adopt the hairline language. Insight headline colors use a zero-specificity `:where()` so goal-health and habit-target colors still win. Test helper hardened: `rule()` now matches only a complete selector list. Files: `css/styles.css`, `tests/design-v1-8.test.js`. Checks: V1.8 contracts 25/25 (4 new failed before implementation); full Node 276/276; static browser contracts 10/10; `git diff --check` passed.

**Phase 8 — Areas, Projects, Tags, Cleaning, Notes and Resources.** Area tabs become underline tabs keyed on `aria-selected="true"` (V1.7 `role="tab"`/`aria-selected`/roving `tabindex` markup unchanged). Area, archived-project and cleaning-room cards share the hairline 8px card; Area summary tiles use Space Grotesk tabular numerals; icon choices keep a distinct keyboard focus ring over the selection ring. Tags get square dots and tabular counts. Notes/Resources continue to render as separate `goal-row knowledge-row` records and inherit the card; clips use a 2px accent rule; filters share the `.filter-bar` panel; knowledge attachment errors use the danger tint. Attachment drop zones use a strong dashed hairline, and the hover/drag-over rule is ordered after the V1.8 section background so drag feedback is not lost (asserted by a source-order contract). Files: `css/styles.css`, `tests/design-v1-8.test.js`. Checks: V1.8 contracts 29/29 (4 new failed before implementation); full Node 280/280; static browser contracts 10/10; `git diff --check` passed.

**Phase 9 — Templates, Saved Views, Settings and More.** Template type switch uses the shared segmented control (Phase 6). Template rows reuse `.goal-row` around a non-interactive `<div class="goal-open">`; V1.8 removes the pointer cursor and hover fill that implied the text was clickable, tightens rows to 56px and centers the Use/Edit/Duplicate/Delete icon buttons. Template editor fieldsets/rows and the Saved View `.template-fields` container (previously unstyled) adopt the form rhythm. Settings cards become hairline panels with 15px Space Grotesk headings and ink-1/ink-3 label pairs; the Today cards `<fieldset class="settings-row">` no longer shows the browser groove border/inset. Snapshot groups, backup summary and backup warning use the panel/warning-tint language. The desktop More menu uses the Phase 5 popover styling; the mobile More sheet was covered in Phase 3. Files: `css/styles.css`, `tests/design-v1-8.test.js`. Checks: V1.8 contracts 32/32 (3 new failed before implementation); full Node 283/283; static browser contracts 10/10; `git diff --check` passed.

**Phase 10 — empty, loading, error, focus and reduced-motion states.** Empty states gain a quiet geometric mark, Space Grotesk heading and hairline dashed panel. The data-loading surface (`renderRecovery()` `migration-loading` branch in `js/app.js`) now renders `class="recovery recovery--loading" role="status" aria-busy="true"` with an `aria-hidden` CSS ring indicator; under `prefers-reduced-motion` the ring is static. Other recovery surfaces carry a 2px danger rail. The sticky storage warning band is now opaque (content previously showed through its 8% tint) with a danger rail; invalid inputs keep a red edge while focused; validation text uses the danger token. Focus: inset rings for rows clipped by `overflow`, scroll containers (Search results, More sheet, segmented controls, tracker) and grid cells; `prefers-contrast: more` strengthens hairlines and muted ink; `forced-colors: active` restores a Highlight outline and the active-navigation markers. The phone touch-target guard remains the final rule and now also restates the 44px completion hit areas and 44px quick chips, Inbox filter tabs, Area tabs and segmented buttons. A class audit asserts every class emitted by `js/*.js`/`index.html` is styled or is one of 11 documented semantic hooks. Files: `css/styles.css`, `js/app.js` (loading markup only), `tests/design-v1-8.test.js`. Checks: V1.8 contracts 37/37 (4 new failed before implementation; the class audit already passed after Phases 4–9 styled the previously unstyled classes); full Node 288/288; static browser contracts 10/10; `git diff --check` passed.

**Final verification and handoff (2026-10-07).** Ran the complete verification block from the V1.8 brief on the final working tree:

| Check | Result |
| --- | ---: |
| `node --test tests/*.test.js` | **288 passed, 0 failed, 0 skipped** (251 V1.7 + 37 V1.8 design contracts) |
| JavaScript syntax (`js/*.js vendor/*.js tests/*.js`) | **53/53** |
| Python AST (`tests/*.py`) | **19/19** |
| `tests/test_browser_path_adapter.py` | **2/2** |
| `tests/test_browser_regression_registry.py` | **3/3** with functions invoked explicitly; the direct command as written exits 0 having run **0** tests (no `__main__`) |
| `tests/run-browser-regressions.py --dry-run` | **10/10** static contracts (2 + 3 + 5); browser launch skipped |
| `git diff --check` | passed; the four new untracked files also have no trailing whitespace |

Additional checks: CSS structural lint (balanced braces, no malformed declarations, no undefined `var()` references); `js/core.js`, `js/storage.js`, `js/backup.js` and `js/attachments.js` unchanged; Search code paths (`openSearch`, `renderSearchModal`, `searchResultsHtml`, `searchTaskResult`, Core search) unchanged; no bulk-selection/bulk-action markup or selectors added.

**V1.8 changed files.** Code: `css/styles.css` (+657/−40; 2,192 lines, V1.8 layer 565 lines), `index.html` (title, `theme-color`), `js/app.js` (brand tooltip string; loading-surface markup), `js/tasks-ui.js` (inline style → class). Tests: `tests/design-v1-8.test.js` (new, 37 contracts). Docs: `docs/superpowers/specs/2026-10-07-todo-v1-8-design.md`, `docs/superpowers/plans/2026-10-07-todo-v1-8.md`, this ledger (all new); `AGENTS.md`, `CLAUDE.md`, `README.md`, `PROJECT_OVERVIEW.md`, `docs/claude/CONTINUATION.md`, `docs/claude/README.md`, `docs/claude/FEATURES.md`, `docs/claude/PROJECT_MAP.md`, `docs/claude/TESTING_AND_RELEASE.md` (updated). The other modified/untracked documentation files in `git status` (and parts of the files above) are the pre-existing, uncommitted 2026-10-07 V1.7 documentation sync, not V1.8 work.

**Known limitations.**

1. No native-browser visual, responsive, touch, keyboard, screen-reader, reduced-motion, high-contrast or forced-colors acceptance was performed; all V1.8 evidence is static/automated.
2. The three earlier design boards are not in the repository; the direction was defaulted to Quiet Graphite / Swiss Compact and specified from scratch.
3. Earlier V1.3–V1.7 CSS layers were intentionally not consolidated; the V1.8 layer wins by source order. Consolidation is deferred until a visual baseline exists.
4. Runtime density tokens are written inline on `<html>` by `renderMain()`, so the V1.5 phone `:root` overrides (`--content-gutter: 12px`, `--control-height: 36px`) never apply after startup (pre-existing). V1.8 does not rely on media-query token overrides; the phone gutter remains 20px in compact density.
5. Completed-goal progress turns mint via `:has()`; browsers without `:has()` keep the accent fill.
6. Hairlines are decorative (below 3:1); controls are identified by fill, label and border together, and hover/focus states exceed 3:1.
7. Space Grotesk, Geist and Phosphor still load from CDNs; offline rendering falls back to system fonts and missing icons.
8. V1.8 was committed as `4cfab6c` on `feature/todo-v1-3` and pushed to `https://github.com/marko-ivapix/dailo` after this verification, at the user's request. The V1.8 distributable was built later the same day (see **Distributable** below); packaging adds no browser evidence.

**Search and no-bulk constraints:** preserved. Search behavior, scope, ranking and code are unchanged (CSS-only restyle of the existing Search modal); no bulk-selection or bulk-action UI, markup or selectors exist (`v1-7-polish` and V1.8 contracts green).

## Distributable

**Packaging (2026-10-07).** Re-ran the verification block in a fresh cloud checkout of `cf0a4bc` (code unchanged since `4cfab6c`; only docs differ) with Node v22.22.0 and Python 3.13.16. There is no `.venv` in that checkout, so the adapter and registry checks ran with the system `python3`.

| Check | Result |
| --- | ---: |
| `node --test tests/*.test.js` | **288 passed, 0 failed, 0 skipped** |
| JavaScript syntax (`js/*.js vendor/*.js tests/*.js`) | **53/53** |
| Python AST (`tests/*.py`) | **19/19** |
| `tests/test_browser_path_adapter.py` | **2/2** |
| `tests/test_browser_regression_registry.py` | **3/3** (functions invoked explicitly) |
| `tests/run-browser-regressions.py --dry-run` | **10/10** static contracts (2 + 3 + 5); browser launch skipped |
| `git diff --check` | passed |

Built `Dailo-v1.8-distributable.zip` from the commit immediately before the package commit (it includes the cloud-session notes merged into `CLAUDE.md` from `feature/todo-v1-3`), using the reproducible recipe in `docs/claude/TESTING_AND_RELEASE.md`: **46 regular files** (the V1.7 layout of 42 plus `docs/claude/CONTINUATION.md` and the V1.8 spec, plan and this ledger), no directory entries. `unzip -t` passed; two independent builds were byte-identical; every extracted file is byte-identical to the source commit. The SHA-256 is recorded only in `Dailo-v1.8-distributable.zip.sha256`. The package was merged into `feature/todo-v1-3` (PR #1) and then into `main` (PR #2, `994ac71`). No browser was opened.

## Manual browser gate

**Manual-pending.** No isolated Chromium, built-in browser pane or personal Chrome was opened by the V1.8 implementation workflow. To close the gate, serve the folder (`python3 -m http.server 8080`) and check in a user-owned browser at desktop (≥1024px), tablet (701–1023px) and phone (≤700px) widths:

- Sidebar expanded/collapsed (240/72px), active marker, badges, project drag targets; tablet icon rail.
- Bottom navigation active indicator and Inbox badge; More sheet open/close/Escape/focus return; Quick Add menu open/close above the bar.
- Today focus strip, dashboard cards (hide/pin/reorder), daily actions grid, task rows (complete/undo, hover actions, drag), milestone checks; Inbox segmented filters and triage chips; Upcoming/Completed groups.
- Task Properties: collapsed disclosures, chips, property rows, subtasks, attachments drop zone hover/drag-over; Quick Add modal; popovers; Search modal; confirmations including typed RESET/RESTORE; toasts including alert variants.
- Calendar Week (type rails, today marker, drag), Month (today chip, counts), Day Detail sheet; narrow-week horizontal scroll.
- Goals list/detail/dashboard (status pills, progress, overdue rail); Habits list/detail, monthly tracker cells, analytics.
- Areas (underline tabs with arrow keys), detail summaries; Projects/Archived; Tags; Cleaning; Notes/Resources lists, filters, clips.
- Templates (segmented types, rows), Saved View editor, Settings (Today cards fieldset), snapshots, backup summary/warnings.
- Empty states, loading surface (spinner static with reduced motion), storage warning band, recovery cards.
- Keyboard focus visibility everywhere (including inset rings in clipped/scrolling containers), `prefers-reduced-motion`, `prefers-contrast: more`, forced colors, and 44px phone touch targets.

Record exactly which items were observed, and on which browser/device, before marking anything as passed.

### Manual observations

| Date | Device / browser | Source | Observed | Result |
| --- | --- | --- | --- | --- |
| 2026-10-07 | iPhone, Safari (tab, not installed) | GitHub Pages `https://marko-ivapix.github.io/dailo/` at `29d1774` | App loads over HTTPS; a newly created task is still present after a page reload | Passed (reported by the user) |

Only the items in this table were observed. Everything else in the gate above remains **manual-pending**.
