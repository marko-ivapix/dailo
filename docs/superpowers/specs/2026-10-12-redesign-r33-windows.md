# Redesign R33 — windows and screens after the third design pass (design)

**Date:** 2026-10-12 · **Status:** findings 22–27, 29 and 32–36 of `docs/superpowers/specs/2026-10-12-design-pass-3.md`, which the user approved with "moze sve" (decision 1: Važno and Hitno leave the task window, their stored fields stay). · **Release:** `2.0.0-alpha.59`.

## What changes

1. **The task window** (22).
   - **The title:** it is a text field that grows with its text (`textarea[data-autogrow]`), so a long title wraps instead of scrolling sideways. CSS `field-sizing: content` sizes it; where that is not supported, `autoGrow` does.
   - **"Više opcija":**
     - It holds two rows that open sheets, like the window's other rows: **Oblast** (a radio sheet) and **Ciljevi** (a check sheet with "Primeni").
     - A task in a project shows the project's area as a plain row without a picker.
     - The caret turns when the fold opens.
   - **Važno and Hitno:** the switches are gone. `isImportant` and `isUrgent` stay in state, sync and backups, and nothing is deleted.
2. **The template editor** (23).
   - **The essentials first:** the name, plus the type's main rows (title, project or area, frequency, and similar).
   - **The rest folds:** everything else sits under "Više opcija".
   - **A field shows only when it applies:**
     - **A repeat's fields:** the interval, the weekdays for a weekly repeat, and the end fields for its end type.
     - **A habit's fields:** they follow its tracking and frequency. The weekdays show only for "Izabrani dani".
     - **A goal's target:** it follows its progress type.
     - **A schedule:** its date shows only when the schedule is on.
   - **Choices are named:** "Bez oblasti", "Bez projekta", "Bez prioriteta". The day offsets read "Planirano: dana posle…" and similar.
   - **The row text:** a template's title is no longer repeated when it equals its name.
3. **Navike → Nedelja and the habit windows** (24).
   - **Habit names:** each name has its own full-width row (a button to the details) above its seven days. The table head has only the seven days.
   - **Radio circles:** they sit on the right in every sheet, the repeat editor included.
   - **Numbers:** they are grouped (10.000), and the quick values field reads them the same way.
4. **Areas** (25).
   - **Example areas:** each has its own icon and color.
   - **New icons:** the area icon choices gain "Porodica i prijatelji" (`ph-users`) and "Finansije" (`ph-wallet`).
   - **The "+" on Oblasti:** it makes a new area.
   - **On an area's screen:** the "+" files the new task into that area.
5. **Smaller windows** (26).
   - **Attachments:** the note and resource window's attachments sit in the task window's attachments block.
   - **The journal entry's ⋯:** it is a titled sheet (`menuSheet`) with a red "Obriši".
   - **Area icon buttons:** each one is named for screen readers (`areaIconName`).
   - **Text fields:** the note text and the journal text grow with their text.
6. **Resource link sheets** (27). The sheets that link tasks, projects and other items:
   - **List:** they show the chosen items first, then the unfinished ones by name.
   - **Search:** they have a search field.
7. **Sheets can be dragged down** (29). Dragging a sheet's header down more than 80 px closes it. The sheet follows the finger while it is dragged.
8. **Icons** (32).
   - **Due date and priority:** an hourglass is the due date and a flag is the priority, everywhere, including the Quick Add preview and the ⋯ menu.
   - **"Bez projekta":** it has its own dashed-circle icon instead of the Inbox tray.
9. **Fokus → Detalji** (33). Opening the task from Fokus and closing the window comes back to Fokus. The timer keeps counting on wall-clock time.
10. **The task ⋯ menu** (34). It fits where it opens:
    - **From the task window:** it leaves out what the window's rows do (plan, due date, project).
    - **A finished task:** it gets no actions that move it.
    - **"Sačuvaj kao šablon":** it comes after "Dupliraj", just above "Obriši".
11. **Touch and order** (35, 36).
    - **Touch targets:** "+ Novi …" rows, "Prikaži još" and folds are at least 44 px.
    - **Subtasks:** they reorder by holding and dragging, like task rows.
    - **Inbox:** a row moves only within its capture group, by touch and by mouse.
    - **Kad stignem:** it keeps the order set in each project, then the oldest first.

## Checks

- **Node:** `tests/redesign-r33.test.js`.
  - **Old tests updated:** tests that pinned the replaced markup now have R33 notes or updated patterns. These are V1.8 design, V1.10 Quick Add, R3, R5, R8a, R8b, R10a, R10b, R12b and R25.
  - **Version check:** R32's version check now reads "≥ 58".
- **Smoke:** the template editor step now opens a habit on selected weekdays, because only those show the weekday chips.
- **Manual-pending:** visual, touch and device checks, including:
  - the growing title on a phone;
  - dragging a sheet down;
  - holding and dragging a subtask;
  - the week table at 320 px.
