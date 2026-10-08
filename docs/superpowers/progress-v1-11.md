# Dailo V1.11 Progress Ledger — Weekly review

**Baseline:** V1.10 (Smart Quick Add)
**Spec:** `docs/superpowers/specs/2026-10-08-todo-v1-11-design.md`
**Plan:** `docs/superpowers/plans/2026-10-08-todo-v1-11.md`

## Status

- [x] Step 1 — Core and persistence
- [x] Step 2 — Page and entry points
- [x] Step 3 — Release 1.11.0 (version, guide); docs sync with the merge
- [ ] Manual: a weekly review on iPhone and Mac (manual-pending)

## Evidence

**Step 1 — core and persistence.** New `tests/weekly-review-v1-11.test.js`, written first; before the change all 7 tests failed.
- **`Core.deriveWeeklyReview(state, today, weekStartsOn)`** returns:
  - the week start;
  - active Inbox tasks;
  - overdue tasks (passed due date, oldest first);
  - missed plans (past planned date, not overdue);
  - planned and due counts for the next 7 days;
  - active goals with `getGoalHealth`;
  - active habits;
  - Areas with their open-task counts (`areaSummary`, so project tasks count through their project's Area).
- **Review log** in `settings.weeklyReviews` (`{ weekStart, completedAt }`):
  - `Core.weeklyReviewLog` keeps valid entries only, newest first, one per week, at most 26;
  - `Core.recordWeeklyReview` adds the current week or replaces its existing entry;
  - `Core.weeklyReviewDue` is true on the last three days of the week (Sunday weeks included) until that week has a record.
- **Backup validation** (`js/backup.js`):
  - a backup whose `weeklyReviews` is present but is not an array of at most 52 valid entries is rejected on export and on import, with "Invalid backup: weeklyReviews";
  - the test confirms the import rejection by editing a valid ZIP;
  - no schema or IndexedDB change.

**Step 2 — page and entry points.**
- **`js/review-ui.js`** (domain module `review`, route `#review`) renders six numbered sections with the existing row actions:
  - Inbox: rows with the Inbox quick actions;
  - overdue and missed plans: rows with the overdue quick actions;
  - next 7 days: day lines with counts and an Upcoming link;
  - Goals: progress and health links;
  - Habits: streak and completion links;
  - Areas: open-task count links.
- **Rest of the page:** each empty section shows a one-line note. The page ends with "Završi nedeljni pregled", or with the done note and up to four previous reviews. Other routes return `undefined`.
- **`js/app.js`:**
  - route `review`;
  - the sidebar PROGRESS link and the phone "Još" entry ("Nedeljni pregled", `ph-clipboard-text`);
  - `reviewTaskRow` in the domain context;
  - `weeklyReviewNotice()` on Today after the backup reminder, with a "Započni pregled" button that opens `#review`;
  - `completeWeeklyReview()`, which records, saves, shows the toast "Nedeljni pregled je završen." and renders.
- **Loading:** `index.html` loads the module after `js/cleaning-ui.js`, and `sw.js` precaches it.
- **CSS:** a V1.11 layer; the step hook is `data-weekly-review-step`.
- **Catalog:** +21 entries (1447). Completed goal health reuses the Goals key `Achieved`.
- **Test stubs** (assertions unchanged): `weeklyReviewNotice: () => ''` in `tests/tasks-today-v1-5.test.js` and `tests/tasks-today-v1-6.test.js`, which slice `renderToday()`.

**Step 3 — release.**
- `APP_VERSION` and `sw.js` `VERSION` are `1.11.0`. The V1.10 release test now requires 1.10.0 or later; the exact pin is in the V1.11 test.
- `uputstvo.html` has a "Nedeljni pregled" section.
- **Latin-only catalog:** a draft translation contained a Cyrillic "и", which the catalog test did not catch. `tests/i18n-v1-9.test.js` now also requires a Latin-only catalog (12 tests). A mutation check confirmed it: putting the letter back makes the test fail.

Checks (Node v22.22.0, Python 3.13.16):
- full Node **357 pass, 0 fail, 0 todo (357 tests)**, including 8 V1.11 tests;
- JavaScript syntax **69/69**;
- static browser contracts 10/10;
- `git diff --check` passed.

Using the review on a real phone and in a desktop browser is **manual-pending**.
