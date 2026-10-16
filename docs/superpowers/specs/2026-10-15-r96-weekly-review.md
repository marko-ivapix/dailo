# R96 — Nedeljni pregled: about 10 minutes, wins first, skippable steps, three priorities for Fokus

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"; for Nedeljni pregled: "Procena „~10 min“ i preskakanje koraka. Početak sa „pobedama ove nedelje“. Na kraju 3 prioriteta za sledeću nedelju, koji idu u Fokus."). The review behind it: six steps sound long and the review began with late tasks. · **Release:** `2.0.0-alpha.123`. No data-model change: the priorities are the existing `settings.focusTaskIds` (at most three open tasks, already normalized, validated in backups and synced with the settings).

## The change

- **How long:** the header reads "Nedelja od 12. okt · oko 10 minuta".
- **Wins first:** a "Pobede" card after "Poslednjih 7 dana" and the journal, before step 1 (`Core.weeklyWins(state, today)`).
  - the tasks completed in the last 7 days: the count and the newest three titles ("+N" for the rest);
  - the goals reached in those days;
  - every daily habit with a streak of 7 days or more.
  - With nothing to show it says "U poslednjih 7 dana još ništa nije završeno."
- **Six steps:**
  1. Isprazni Inbox;
  2. Kasni i propušteno;
  3. Sledećih 7 dana;
  4. Projekti (R94);
  5. Ciljevi, navike i oblasti — one look with three small headings, the rows as before;
  6. Prioriteti za sledeću nedelju.
- **Skipping:** each step that is not done ends with "Preskoči ovaj korak".
  - A skipped step folds to "· preskočeno" with "Prikaži".
  - The skips are kept for the current week in `ui.reviewSkipped` (`{ week, steps }`, this device), so a new week starts with none.
- **Priorities (step 6):**
  - The chosen ones show with "✕". While fewer than three are chosen, up to six suggestions show with "+" (`Core.priorityCandidates`):
    1. each active project's next step;
    2. then what is planned or due in the next 7 days;
    3. then Kad stignem without a project;
    4. then the later steps of projects.
  - Suggestions leave out Inbox, repeating tasks and the chosen ones. The step's count reads "2/3".
- **Danas:** "Prioriteti ove nedelje" leads the main part (a ★ row per task, opening it) with "Fokusiraj se na njih", which opens Fokus on the first priority. Fokus goes through the priorities first, then past-due and planned tasks (`focusableTasks`).
- **Pages:** the guide's review section gets a paragraph. **Šta je novo** gets a line, and its range ends at alpha.123.

## Checks

- **Node:** `tests/weekly-review-r96.test.js`, written first; it failed 8/8. It covers:
  - the wins;
  - the priority suggestions;
  - the header and the wins card;
  - skipping and showing a step, and a new week;
  - the merged step and the priorities (three at most);
  - Danas and Fokus;
  - Serbian and the guide;
  - the version.
- **Older tests updated (with comments):**
  - `redesign-r13` and `weekly-review-v1-11`: the subtitle;
  - `redesign-r47c`: the priorities lead Danas's main part;
  - `projects-r94`: the merged step;
  - R95's version pin is now "or later".
- **Chromium:** see the ledger row.
- **Manual-pending:** the phone.
