# Redesign R18 — reminder settings (data-model design)

**Date:** 2026-10-10 · **Status:** after the settings audit the user chose "a, b i c" (2026-10-10): a default reminder time, the journal reminder as a phone notification, and a reminder at a task's planned time · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.41`.

## Data model

Three optional settings join `state.settings`. They work like `journalReminderTime` and `dailyCapacityMinutes`:

- they sync with the other settings;
- they travel in backups;
- they are validated on import;
- a missing value means the default, so no migration is needed.

| Key | Type | Missing means | Meaning |
| --- | --- | --- | --- |
| `defaultReminderTime` | `"HH:MM"` | `"09:00"` | The hour used wherever Dailo proposes a reminder time. |
| `plannedTimeReminders` | boolean | `false` | A task with a planned date and time reminds at that time when it has no reminder of its own. |
| `journalNotifications` | boolean | `false` | The phone app also notifies at the journal reminder time. |

- **Backup validation** (`js/backup.js`): `defaultReminderTime`, when present, must be a normalized time. The two flags, when present, must be booleans.
- **Core readers:** `Core.defaultReminderTime(settings)`, `Core.plannedTimeReminders(settings)` and `Core.journalNotifications(settings)` return the effective values.
- **New device-local key** `dailoPlannedFired`, outside state, backups and sync: `{ taskId: moment }`. It records planned-time reminders already shown in the open app, so each one appears once. Entries older than two days are dropped.

## Behavior

1. **a) Default reminder time.**
   - **What follows it:**
     - the task reminder sheet: "Dan pre u {vreme}" and "Sutra u {vreme}" replace "Dan pre u 9:00" and "Sutra ujutru", and the sheet's starting time without a plan;
     - a new goal's reminder time;
     - a habit's first reminder;
     - a new reminder in a template.
   - **What stays:** existing reminders keep their times. Core's fallback for a stored goal reminder without a time stays 09:00, so stored data reads the same.
2. **b) Journal notification on the phone.** It is on only when `journalNotifications` is true, the journal reminder has a time (not "Isključeno"), and Dailo runs as the phone app.
   - **The plan:** `Core.notificationPlan` adds one notification per day at that time for the next 14 days.
   - **Today:** today is left out once it has an entry with text or a mood. The plan is rebuilt after every save, so writing the entry removes today's notification.
   - **The notification:** "Dnevnik" with "Zapiši kako je prošao dan". A tap opens Dnevnik.
   - **On the web:** the evening notice on Danas (R12c) stays the reminder. The setting row shows only in the phone app.
3. **c) Reminder at the planned time.** It applies when `plannedTimeReminders` is true and an open task has a planned date and time but no `reminderAt`. The moment is the planned date and time.
   - **On the phone:** `notificationPlan` schedules it under its own key (`planned:` moment), so it never clashes with a set reminder.
   - **In the open app:** it shows as a reminder toast (and a browser notification when allowed) if the moment passed less than two hours ago. Turning the setting on therefore does not flood the screen with old plans. It is recorded in `dailoPlannedFired`.
   - **A set reminder wins:** a task with its own reminder uses only that.

## Settings (Opšte)

- **"Podrazumevano vreme podsetnika":** a select from 06:00 to 21:00, plus a stored time that is not on the hour.
- **"Podsetnik u planirano vreme":** a checkbox, "Zadatak sa planiranim vremenom javi se tada i bez svog podsetnika."
- **"Dnevnik i na telefonu":** a checkbox under "Podsetnik za dnevnik", shown only in the phone app, "Obaveštenje stiže i kad je Dailo zatvoren."

Each choice applies at once.

## Tests (written first)

`tests/redesign-r18.test.js`:

- the Core readers and their defaults;
- backup validation;
- `notificationPlan` with planned-time reminders: on, off, a set reminder winning, a fired one left out;
- `notificationPlan` with journal notifications: off, on, today left out after an entry, off when the journal reminder is off;
- the in-app planned reminder, with its two-hour window and the fired record;
- the reminder sheet presets following the default time;
- the habit, goal and template defaults;
- the three Settings rows and their handlers;
- the tap target for a journal notification;
- the Serbian text;
- the version `2.0.0-alpha.41`.
