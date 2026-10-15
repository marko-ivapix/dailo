# R101 — Arhiva: Završeni zadaci opens with what was done

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"). For Arhiva the plan read: "Sažetak postignuća („ovog meseca: 84 zadatka“)." · **Release:** `2.0.0-alpha.129`. No data-model change: the summary is counted from the completed tasks.

## The change

- **Završeni zadaci** opens with a card "Postignuća", between the header and the chips. It shows:
  - "Ovog meseca: 84 zadatka";
  - "Prošlog meseca: 61 zadatak · Ove godine: 512 zadataka";
  - "Najbolji dan: 2. okt (9) · Niz: 5 dana zaredom".
- **What it counts** (`Core.completionSummary(tasks, today)`):
  - the completed tasks by their local completion day, up to today;
  - this month, last month (December for January) and this year;
  - the best day this month: the most completed, the earliest of equals;
  - the run of days with at least one completed task. It counts from today, or from yesterday until something is completed today.
- **The filters:** the card counts all completed tasks, whatever the chips below filter.
- **What hides:**
  - the best day shows only when it has more than one task;
  - the run shows only from two days;
  - with nothing completed this year, last month or this month there is no card.
- **Archived projects** are not counted: archiving a project is not the same as finishing it.
- **Goals** are left out (the user: "osim ciljeva").
- **R103:** old completed tasks will leave the device's main store (IndexedDB v2, R103). The summary has to keep counting them then.
- **Pages:**
  - the guide's Nedeljni pregled section gets a sentence;
  - **Šta je novo** gets a line, and its range ends at alpha.129.

## Checks

- **Node:** `tests/completed-summary-r101.test.js`, written first; it failed 4/4. It covers:
  - the counts, the best day and the run (also before anything is done today, and across the new year);
  - the card before the chips and what hides;
  - the styles, Serbian, the guide and Šta je novo;
  - the version.
- **Older tests updated (with comments):**
  - `redesign-r10e`: the harness loads `completedSummaryCard`, and the card may come before the chips;
  - R100's version pin is now "or later".
- **Chromium:** see the ledger row.
- **Manual-pending:** the phone.
