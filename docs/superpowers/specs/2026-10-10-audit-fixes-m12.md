# M12 — audit fixes: colors, export limits, device-local reminder state, focus (design)

**Date:** 2026-10-10 · **Status:** approved ("Može sve", 2026-10-10, to the proposed list) · **Release:** `2.0.0-alpha.4` · **Source:** audit `2026-10-09-modernization-capacitor-audit.md`, findings S-4, E-1, R-3, A-2.

## S-4 — only hex colors reach a style attribute

Project, tag and area colors come from backups and sync as well as from the palette, and they end up inside `style="--project-color:…"`. Escaping stops an attribute break-out but not a second CSS declaration (`red;background:…`).

- `Core.safeColor(value, fallback)` accepts `#rgb` and `#rrggbb` only.
- The app's `normalizeState` (every load, import commit and sync apply) replaces any other project, tag or area color with the palette color for its position. Template instantiation does the same for a project template's color.
- Imports are not rejected for a bad color, so old or hand-edited backups stay importable.

## E-1 — the export never produces a backup the import refuses

The import limits were 2,000 ZIP entries, 200 attachments, 50 MB of attachments and 100 MB decompressed. The export enforced none of them, so a large backup could be exported but never imported — and the ZIP is the way to move data into the app.

- **Limits aligned and raised.** Export and import now share the same `Backup.LIMITS`, raised to fit real use within phone memory: 2,000 entries, 1,000 attachments, 250 MB of attachments, 300 MB decompressed.
- **Checks before the ZIP.** `exportBackupV3` checks the attachment count, the attachment bytes, the entry count and the decompressed total before it builds the ZIP. When the data is over a limit, it stops with the same message the import would give.
- **The same rule for reset and restore.** The safety ZIP before a reset or restore uses the same export, so those operations also stop with that message.

## R-3 — a reminder that fires on one device does not rewrite the record for the others

Before this change, firing a reminder set `reminderFiredAt` / `reminderFiredMoments` and bumped `updatedAt`. That changed the synced record, so the next push could overwrite an edit made meanwhile on another device (last write wins).

- **Device-local fields.** `tasks.reminderFiredAt`, `goals.reminderFiredMoments` and `habits.reminderFiredMoments` become device-local sync fields (like `attachmentIds`). They are never pushed, a pull keeps this device's values, and they still go into this device's ZIP backups.
- **No `updatedAt` bump for a firing.** Firing a reminder no longer touches `updatedAt`. A habit snooze that ends still does, because the snooze itself is shared.
- **When a task reminder counts as fired.** It counts as fired only when `reminderFiredAt` is not earlier than its `reminderAt` (`Core.taskReminderFired`). A reminder moved to a later time on another device fires again here.
- **Upgrading a shadow.** The sync shadow gets a format number (`shadowFormat: 2`). On the first round after the upgrade, every record that is unchanged since the last sync has its shadow hash rewritten without the device-local fields, so nothing is pushed just because of the format change and remote deletions still apply.
- **Records from older clients.** Rows that still carry the fields are compared and stored without them.
- **A new device.** A record that first arrives through sync gets its past reminder moments marked as handled (`Core.settleArrivedReminders`), so a new device does not replay old reminders.

## A-2 — focus survives a re-render; a route change names the page

- **Focus after a re-render.** `render()` remembers the focused control in the sidebar, the main view or the bottom navigation, by id or by its data attributes (`focusDescriptor`). When the re-render left focus on `<body>`, it puts focus back on the same control.
- **Route changes.** On a route change, `document.title` becomes "{page title} · Dailo" and focus moves to the page heading (`tabindex="-1"`), unless a dialog is open. The title is also set on every render.

## Tests (written first)

`tests/audit-fixes-m12.test.js`:

- `safeColor` and the normalization sites;
- export limits: the shared values, an export refused at small limits, and a normal export that imports;
- device-local fields: push without them, a pull keeping local values, no push after a firing, the shadow upgrade, and settling on arrival;
- `taskReminderFired`;
- no `updatedAt` bump in the checker;
- focus and title wiring.

`npm run smoke` checks the title and the heading focus after a route change in jsdom. Version `2.0.0-alpha.4` is pinned in that file.
