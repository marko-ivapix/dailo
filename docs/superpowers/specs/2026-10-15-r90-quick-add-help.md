# R90 — Brzo dodavanje helps while typing

**Date:** 2026-10-15 · **Status:** the user's request from the review list ("sve odradi osim ciljeva"). · **Release:** `2.0.0-alpha.117`. No data-model change.

## The change

### A recognized part can stay in the title

- **The preview's parts are buttons** (`quick-keep`), with the line "Dodirni deo da ostane u naslovu." under them.
  - A tap keeps those words in the title, for example a film called "Sutra".
  - The day and the time are now separate parts, so each can be kept.
- **`Core.parseQuickAdd` options:**
  - `keep` takes `{ slot, text }` items. A clause whose slot and words match is not read: its words move to the end of the title, and the reading goes on to their left. "Ponuda rok petak 45min sutra u 9:30" with "sutra" kept is "Ponuda sutra", with the deadline, the duration and the time still read. Kept tokens (#tag, +project, @area, !priority) stay as text.
  - `sources` makes the result say which words set each part (Latin, lower case; tags as `tag:<id>`).
  - Without the options the result keeps its old shape.
- **The draft:** `draft.keepInTitle` is the sheet's list. Words typed later are read as before, because only the same words are kept.
- **Parsing in the app:** `parseQuickAddTitle(rawTitle, parsePlan, keep)` passes both options. The sheet, the input handler, `quickPlace` and `createTask` pass the draft's list.

### Suggestions for #, + and @

- `Core.quickSuggestions(title, { tags, projects, areas })` finds the names that begin with the word being typed at the end of the title. It compares without case and diacritics and reads Cyrillic as Latin.
  - It returns at most five, leaves out archived projects and areas, and leaves out an exact match.
  - It returns `null` when the last word is no such token.
- **The sheet** shows them as chips under the title (`quick-suggest-slot`, updated while typing). A tap completes the word (`applyQuickSuggestion`) and adds a space. Spaces in a name become dashes, which the parser reads as the same name ("+Sajt-za-klijenta").

### A pasted list

- **The paste:** pasting two lines or more into the title (`handlePaste`, a `paste` listener) does not paste. `Core.splitPastedList` drops bullets, numbers and check boxes and empty lines, and keeps at most 100 lines.
- **The sheet asks first:** "Lista od N redova", the first five lines, then "Napravi N zadataka" or "Kao jedan zadatak".
  - **"Napravi N zadataka"** (`createPastedTasks`) makes one task per line, read like a title: its day, time, deadline, duration, repeat, project, area, tags and priority. The sheet's own day and place apply, as for a single task. One Poništi ("Dodata su N zadatka") removes them all.
  - **"Kao jedan zadatak"** (`joinPastedLines`) puts the lines into the title, one after another.
- **AGENTS.md** records this as part of the bulk exception the user chose. It makes new tasks after a confirmation, with one Undo; there is still no selection of existing items.

### Pages

- The guide gets a paragraph.
- **Šta je novo** gets a line, and its range ends at alpha.117.

## Checks

- **Node:** `tests/quick-add-help-r90.test.js`, written first; it failed 8/8. It covers:
  - keep and sources;
  - suggestions;
  - list lines;
  - the preview buttons and their handler;
  - the suggestion slot;
  - paste, make and join, and AGENTS.md;
  - styles, Serbian and the guide;
  - the version.
- **Older tests updated (with comments):**
  - `redesign-r30` and `redesign-r33`: the preview's `item` names its slot first;
  - `redesign-r4`: the harness loads `quickSuggestHtml`;
  - `quick-add-words-r89`: the preview line, and the version pin is now "or later".
- **Chromium:** see the ledger row.
- **Manual-pending:** the phone (pasting from another app; the keyboard staying up after a suggestion).
