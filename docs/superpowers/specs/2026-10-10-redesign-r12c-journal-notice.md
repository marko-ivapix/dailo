# Redesign R12c — the evening journal notice and its setting (design)

**Date:** 2026-10-10 · **Status:** implements J4 and J6 of `2026-10-08-redesign-decisions.md` (final 2026-10-09) on R12a and R12b · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.33`. This closes R12; the weekly-review row (J8) comes with R13.

## What changes

1. **The evening notice on Today (J4)** is a quiet notice under the other Today notices (T6), in the same style as the weekly-review notice.
   - **When it shows:** from the reminder time on, and only while today has no entry. An entry with text or a mood counts.
   - **Its content:**
     - "Zapiši kako je prošao dan";
     - the day's summary so far ("Završeno 2 zadatka · navike 1/3.");
     - "Zapiši" opens today's entry;
     - "Ne danas" hides it until tomorrow and says "Podsetnik se vraća sutra uveče".
   - **The module:** `js/journal-ui.js` renders the notice (route `journal-notice`), so the notice and the entry window share the summary.
   - **"Ne danas"** is device-local: `localStorage` key `dailoJournalLater` holds the day. It is outside state, backups and sync, like the other device-local keys.
2. **The setting (J6):** Settings → Opšte gets "Podsetnik za dnevnik", with the line "Kad se na Danas javlja „Zapiši kako je prošao dan“".
   - **Choices:** Isključeno, Od 19:00, Od 20:00 (default), Od 21:00, Od 22:00. A time synced from elsewhere is shown too.
   - **Saving:** the choice applies at once to `settings.journalReminderTime` (`null` for Isključeno). It syncs with the other shared settings.
3. **The notice is not a phone notification.** It appears when Today is open, like the weekly-review notice. A native evening notification can come later with the reminder work.

## Compatibility

- **Data:** the R12a setting.
- **Device-local key:** the new `dailoJournalLater`.

## Tests (written first)

`tests/redesign-r12c.test.js`:

- the notice before and after the time;
- with an entry (text or mood) and without;
- turned off;
- "Ne danas" for today only;
- its markup and actions;
- the Settings row with its choices and saving;
- Today calling the notice;
- the version `2.0.0-alpha.33`.

`npm run smoke` adds: Podešavanja → Podsetnik za dnevnik → Isključen applies at once.
