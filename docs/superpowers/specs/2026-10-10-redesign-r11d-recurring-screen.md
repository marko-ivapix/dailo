# Redesign R11d — "Redovne obaveze" and groups (design)

**Date:** 2026-10-10 · **Status:** implements S4 and M4 of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.29`.

S4 ships in two parts:

- **R11d:** the screen and its groups (this spec).
- **R11e:** the "Nova redovna obaveza" window with the repeat editor (S15). Until then "+ Dodaj obavezu" opens the existing chore form.

## What changes

1. **"Čišćenje" becomes "Redovne obaveze"** (S4, M4). The screen route stays `cleaning`. In "Još" → Planiranje the row is renamed, uses the repeat icon, and shows how many open tasks repeat.
2. **The screen shows everything that repeats.** That means every task whose repeat is active or paused, open or completed, with these left out:
   - Inbox items;
   - tasks of archived projects or groups;
   - open tasks whose repeat has ended.

   The screen shows:
   - **The summary:** "N obaveza se ponavlja · M kasni".
   - **Chips:** "Sve", one per active group, "Iz projekata" (when a project has repeating tasks) and "+ Grupa". The choice is kept in `ui.cleaningRoomFilter`.
   - **Under "Sve", "Ove nedelje · N":** what is late or comes within 7 days, from every group, project and "Bez grupe", sorted by date. Each row names its group or project.
   - **Sections, in this order:**
     - the groups, each with ⋯ and "+ Dodaj obavezu";
     - the projects with repeating tasks, with the project's dot and name (it opens the project) and "projekat";
     - "Bez grupe": repeating tasks without a project.

     Each section shows its open count, the open rows sorted by date, and "Završeno · N" folded (`ui.cleaningCompletedExpanded`).
   - **"Arhivirane grupe · N"** folded at the bottom (`ui.cleaningArchivedOpen`), each with its open count and "Vrati".
   - **A closing note.**
   - **The empty state** (no groups and nothing repeating): "Još nema redovnih obaveza", one line, and "Primer: stan", "Primer: kuća" and "+ Grupa".
3. **Rows are Today rows** (`renderChoreRow`, the R2 row with `metaText` and `sideHtml`):
   - **Meta line:** the place (in "Ove nedelje") and the repeat sentence, or "Završeno: …" for a completed one.
   - **Right side:**
     - "Kasni · 8. okt" in red;
     - "Danas";
     - "Sutra";
     - the date;
     - "Bez datuma".
   - **The round check:** completes the task and schedules the next one (R11c's message with "Poništi").
4. **Groups are the existing cleaning rooms** (projects with `isCleaningRoom`, in the "Kuća" area). The data is unchanged.
   - **"+ Grupa" (sheet "Nova grupa"):**
     - a name field;
     - "Napravi grupu";
     - "Grupa „…“ je napravljena".

     An empty or duplicate name is refused ("Grupa mora imati naziv.", "Ta grupa već postoji.").
   - **The group's ⋯ (a sheet with its name):**
     - **Preimenuj:** the same sheet with "Sačuvaj"; "Grupa je preimenovana" with "Poništi".
     - **Arhiviraj grupu:** "Grupa i njene obaveze se sklanjaju dok je ne vratiš."; "Grupa „…“ je arhivirana" with "Poništi".
     - **Obriši grupu:** "Obaveze ostaju, u „Bez grupe“." It asks first. The group is removed, its tasks keep the group's area and move to "Bez grupe", goal links and resource relations to it are removed, and "Grupa je obrisana · N obaveza u „Bez grupe“" offers "Poništi", which puts everything back.
   - **"Vrati"** on an archived group: "Grupa „…“ je vraćena" with "Poništi".
5. **Groups stay out of other screens.** They do not appear in Zadaci → Projekti, its count or Arhivirani projekti; their tasks still appear on Today, in the Calendar and in Search.
6. **Removed:**
   - the room select;
   - the preset buttons in the header;
   - the room cards with their project menu;
   - the "New cleaning room" form;
   - unused catalog entries.

## Compatibility

- **Data:** unchanged. A group is still a project with `isCleaningRoom: true`.
- **Old filter values:** an old `ui.cleaningRoomFilter` that names no active group falls back to "Sve".
- **Historical scripts:** the manual Playwright scripts that opened the cleaning screen are historical browser checks, not run here.

## Tests (written first)

`tests/redesign-r11d.test.js`:

- which tasks the screen shows, with the summary, chips, "Ove nedelje", the section order, the counts, the folds and the archived groups;
- the row meta and side;
- the empty state;
- creating, renaming, archiving, restoring and deleting a group, each with Undo;
- duplicate and empty names;
- groups left out of Zadaci → Projekti and Arhivirani projekti;
- the "Još" row;
- the version `2.0.0-alpha.29`.

`npm run smoke` adds: Još → Redovne obaveze → "+ Grupa" → Napravi grupu → the group section with "+ Dodaj obavezu".
