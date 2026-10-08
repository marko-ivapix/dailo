# Dailo V1.12 Progress Ledger — Duration and time-blocking

**Baseline:** V1.11 (Weekly review)
**Spec:** `docs/superpowers/specs/2026-10-08-todo-v1-12-design.md`
**Plan:** `docs/superpowers/plans/2026-10-08-todo-v1-12.md`

## Status

- [x] Step 1 — Core and persistence
- [x] Step 2 — Calendar day view
- [x] Step 3 — Today, Settings, Quick Add
- [x] Step 4 — Release 1.12.0 (version, guide); docs, ZIP and merge with the Phase 4 PR
- [ ] Manual: day view, drag, time inputs and capacity on iPhone and Mac (manual-pending)

## Evidence

**Step 1 — core and persistence.** New `tests/time-blocking-v1-12.test.js`, written first; before the change all 10 tests failed.
- **`Core.daySchedule(tasks, date, { defaultMinutes = 30 })`:**
  - blocks for timed tasks planned on the date, sorted by start; a missing duration uses 30 minutes and is marked `estimated`;
  - `conflict` compares open blocks only; completed blocks are kept and never conflict;
  - `unscheduled` lists open tasks without a time, in Today order and then by title;
  - `range` is 06–24, starting earlier when a block starts before 06:00.
- **`Core.dayLoad`** sums the durations of open tasks planned on the date and counts tasks with and without a duration.
- **`Core.dailyCapacityMinutes`** accepts an integer from 0 to 1440, 0 meaning off; anything else (missing, string, fraction, out of range) means 360.
- **Backups:** `js/backup.js` rejects an invalid `settings.dailyCapacityMinutes` on export and import ("Invalid backup: dailyCapacityMinutes"). Round trip covered; no schema change.

**Step 2 — calendar day view.**
- **`js/calendar-ui.js`:**
  - "Dan" / "Nedelja" / "Mesec" switch; the day period uses `Intl` with weekday, day, month and year; previous/next say "Prethodni dan" / "Sledeći dan";
  - `renderDayView`: capacity bar, shown when capacity is on and a task has a duration, with an over-capacity warning;
  - "Bez vremena" rows: draggable through the existing `data-calendar-drag="task"`, with a native time input on the existing `data-task-time="plannedTime"` change handler;
  - an hour grid of `data-calendar-time="HH:00"` rows inside `data-calendar-date`, so the existing calendar drop handler sets date and time;
  - blocks placed with `calc(var(--hour-height) * …)`, with `has-conflict`, `is-estimated` and `is-completed` classes;
  - an empty-day note with "Dodaj zadatak".
- **Calendar view state:** `ui.calendarView` keeps `day` (normalized with week and month).
- **Navigation:** `navigateCalendar` moves by one day in the day view.

**Step 3 — Today, Settings, Quick Add.**
- **Today strip:** `durationLabel` ("45 min", "2 h", "1 h 30 min") and `todayCapacityItem` in the Today focus strip. The item is shown once a task planned for today has a duration; it gets `is-over` and an accessible label when over capacity.
- **Settings → General:** "Dnevni kapacitet" offers Off / 2 / 4 / 5 / 6 / 7 / 8 / 10 / 12 h, plus any imported value. The change handler stores only integers from 0 to 1440.
- **Quick Add:** a "Trajanje" chip opens 15–120 min presets, and "Ukloni trajanje" appears when a duration is set. It sets the explicit `durationMinutes`, which wins over parsed text.
- **CSS and catalog:** a V1.12 layer; +15 catalog entries (1462); `durationLabel` added to the domain context.
- **Test stubs** (assertions unchanged): `todayCapacityItem: () => ''` in the two tests that slice `renderToday()`.

**Step 4 — release.**
- `APP_VERSION` and `sw.js` `VERSION` are `1.12.0`. The V1.11 release test now requires 1.11.0 or later.
- `uputstvo.html` gains a "Raspored dana" section.

Checks (Node v22.22.0, Python 3.13.16):
- full Node **367 pass, 0 fail, 0 todo (367 tests)**, including 10 V1.12 tests;
- JavaScript syntax **70/70**;
- static browser contracts 10/10;
- `git diff --check` passed.

Drag, native time inputs and the grid layout on a real phone and desktop browser are **manual-pending**.

**Package (2026-10-08).** `Dailo-v1.12-distributable.zip` plus `Dailo-v1.12-distributable.zip.sha256`, built with the V1.12 recipe in `docs/claude/TESTING_AND_RELEASE.md` from `5fa586b`, the docs commit.
- 85 regular files and no directory entries; `unzip -t` passed.
- Every extracted file matches the commit, and a second build gives the same SHA-256 (recorded only in the sidecar).
- It closes roadmap Phase 4. V1.10–V1.12 go into `main` together through one PR.
