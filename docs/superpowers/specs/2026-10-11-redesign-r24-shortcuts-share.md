# Redesign R24 — icon shortcuts and "Podeli u Dailo" (design)

**Date:** 2026-10-11 · **Status:** additions B and C of the second design pass, which the user approved with "moze sve" · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.49` (Android app and the installed web app; iOS later, see below).

## B — Shortcuts on the icon

- **The shortcuts:** a long press on the Dailo icon offers "Novi zadatak", "Danas" and "Dnevnik".
- **Android:**
  - static shortcuts in `res/xml/shortcuts.xml`, with Serbian labels in `strings.xml` and three small vector icons (`ic_shortcut_add`, `ic_shortcut_today`, `ic_shortcut_journal`);
  - each one opens `MainActivity` with a `dailo://new-task`, `dailo://today` or `dailo://journal` link.
- **The installed web app:** `manifest.webmanifest` has the same three shortcuts (`./?shortcut=new-task`, `today`, `journal`).

## C — "Podeli u Dailo"

- **Android:**
  - **Receiving:** `MainActivity` accepts shared text (`SEND`, `text/plain`) and turns it into a `dailo://share?text=…&subject=…` link before Capacitor sees the intent.
  - **Reopening from Recents:** the same intent comes back, so it is ignored there. Nothing is shared or opened a second time.
- **The installed web app:** `manifest.webmanifest` has a GET share target (`share_title`, `share_text`, `share_url`). The service worker already serves the app shell for any address.
- **What opens:** Quick Add with a draft from `Core.sharedTextDraft`:
  - **The title:** the subject (or title), else the first line. A bare link is named by its site ("example.com"). At most 200 characters.
  - **The notes:** the other lines, plus a link that is not already in the title.

  The note shows under the title with a link icon (`.quick-shared-note`) and is saved with the task. The user can edit or cancel before saving.

## One path for both

- **`handleIncomingLink(href)`:**
  - `dailo://new-task` opens Quick Add;
  - `today` and `journal` open their screens;
  - `share` opens the shared draft.

  An open window is saved and closed first. During an import, a restore or recovery nothing happens.
- **The phone app:** links arrive through the App plugin (`DailoPlatform.links.onAppLink`, `appUrlOpen`). The plugin keeps a link that started the app until the listener exists.
- **The web app:** it reads `?shortcut=` or `share_*` once at start (`consumeLaunchParams`) and cleans the address, so a reload does not repeat it.

## iOS

The Home Screen quick actions and a share extension need native targets and a Mac to build and check. They wait for the user's first iOS build.

## Data

Nothing changes in the data. A shared draft is an ordinary new task.

## Tests (written first)

`tests/redesign-r24.test.js`:

- `sharedTextDraft` cases;
- `handleIncomingLink` for each link, with an open window and during an import;
- `onAppLink` and the start address;
- the shared note in Quick Add;
- the web manifest;
- the Android shortcuts, strings and icons;
- the share intent filter and `MainActivity`;
- the version `2.0.0-alpha.49`.

The debug APK builds in the cloud.

## Manual checks

On the phone:

- the long press shows the three shortcuts and each opens its screen;
- "Podeli" → Dailo from Chrome and from a notes app opens Quick Add with the title and the link.
