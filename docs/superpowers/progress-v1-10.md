# Dailo V1.10 Progress Ledger — Smart Quick Add

**Baseline:** V1.9.1 on `main` (`3597343`, PR #6)
**Spec:** `docs/superpowers/specs/2026-10-08-todo-v1-10-design.md`
**Plan:** `docs/superpowers/plans/2026-10-08-todo-v1-10.md`

## Status

- [x] Step 1 — Parser
- [x] Step 2 — Saving and preview
- [x] Step 3 — Release 1.10.0 (version, guide, docs)
- [ ] Manual: Quick Add with the new syntax on iPhone (manual-pending)

## Evidence

**Step 1 — parser.** New `tests/quick-add-v1-10.test.js`, written first. Before the change all 12 tests failed (`Core.parseQuickAdd` did not exist).
- **`Core.parseQuickAdd(text, { today, tags, projects, areas, parsePlan })`** (`js/core.js`, pure):
  - trailing clauses are read right to left in any order, one per kind, stopping at the first ordinary word: plan date (day words, `prekosutra`, `za N dana/nedelja`, `in N days/weeks`, `d.m.`, `d.m.yyyy.`, ISO dates), time, due date (`rok`/`due` + day, `do` + genitive weekday/day/date) and duration (`45min`, `45 min`, `45m`, `1h`, `1,5h`, `1h30`, `1h30m`, `1h 30min`, `2 sata`; 1–1440 minutes);
  - tokens anywhere: `#tag`, `!high/medium/low` and `!visok/srednji/nizak`, `+project`, `@area`. Names are matched loosely (case, spaces, `_`, `-` and diacritics are ignored), and archived projects and Areas are skipped;
  - an invalid clause leaves the trailing part as written; `do H:MM` and `za <weekday>` are not parsed.
- **Compatibility:**
  - `Core.parseQuickPlanPhrase` is now a wrapper limited to plan date and time, and keeps its V1.5/V1.9 results;
  - `Core.splitQuickTime` (V1.9) is removed; its only caller now uses the parser.
- **Behavior changes, intended and recorded in the spec:**
  - a weekday after `za` is no longer parsed;
  - when two priority tokens appear, the first one wins (V1.5 took the last), and later ones stay in the title.

**Step 2 — saving and preview.**
- **`js/app.js`:**
  - `parseQuickAddTitle` delegates to the parser;
  - `createTask` applies the parsed due date, duration, project and Area after the picker values, and Inbox placement and project order use the resolved project;
  - `quickParsePreview` renders the recognized fields as pills under the title (`data-quick-preview`, `role="group"`) inside a stable `data-quick-preview-slot` (`aria-live="polite"`), updated on every keystroke.
- **CSS:** a V1.10 layer before the touch-target guard; the empty slot is hidden.
- **Catalog:** +1 entry ("Recognized in title" → "Prepoznato u naslovu"); 1426 entries.
- **Test source update** (same intent): `tests/quick-add-v1-9.test.js` compares only the V1.9 fields of `parseQuickAddTitle`.

**Step 3 — release.**
- `APP_VERSION` and `sw.js` `VERSION` are `1.10.0`. The exact version is pinned only in the newest release test (`tests/quick-add-v1-10.test.js`).
- `tests/release-v1-9.test.js` and `tests/beta-v1-9-1.test.js` now require "V1.9 or later" and "1.9.1 or later". The second also checks that `sw.js` follows `APP_VERSION`.
- The beta guide (`uputstvo.html`) lists the new syntax with an example checked against the parser.

Checks (Node v22.22.0, Python 3.13.16):
- full Node **348 pass, 0 fail, 0 todo (348 tests)**, including 13 V1.10 tests;
- JavaScript syntax **67/67** (`js/*.js vendor/*.js tests/*.js tests/support/*.js sw.js`);
- static browser contracts 10/10; registry 3/3; path adapter 2/2;
- staged `git diff --check` passed.

Typing and the live preview on a real iPhone are **manual-pending**.
