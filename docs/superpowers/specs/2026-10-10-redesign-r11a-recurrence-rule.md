# Redesign R11a — the extended repeat rule (data model)

**Date:** 2026-10-10 · **Status:** the data-model spec the plan requires before any UI uses the rule (`docs/superpowers/plans/2026-10-10-redesign-implementation.md`, "Data-model changes come in their own steps"); it implements the rule decided in S15 of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Release:** `2.0.0-alpha.26`.

R11 ships in parts:

- **R11a:** this rule in Core, backups and templates, with no UI.
- **R11b:** the shared repeat editor in the task window (S15, E7).
- **R11c:** the repeat controls and the narrower "Samo ovo / Ovo i buduća" question (S14).
- **R11d:** "Redovne obaveze" (S4).

## The rule

A task's `recurrence` keeps its fields:

- `frequency` and `interval`;
- `status`, `endType`, `endDate` and `endAfterOccurrences`;
- `occurrencesCreated`, `skipNext` and `seriesId`.

It gains one frequency and a few optional fields.

| Field | Values | Meaning |
| --- | --- | --- |
| `frequency` | `daily`, `weekly`, `monthly`, **`yearly`** (new) | Godišnje repeats the start date every `interval` years. |
| `weekdays` | array of distinct integers 0–6 (0 = Sunday), at least one; `weekly` only | Nedeljno on any weekdays: "Sredom i subotom". Weeks start on Monday. With `interval` N, the next week used is N weeks later. |
| `monthMode` | `day` or `weekday`; `monthly` only | Mesečno by "Dan u mesecu" or "Dan u nedelji". |
| `monthDay` | 1–31 or `"last"`; `monthMode: "day"` | 29–31 fall on the last day of shorter months; `"last"` is always the last day. |
| `weekOfMonth` | 1–4 or `"last"`; `monthMode: "weekday"` | With `weekday`, e.g. the first Monday or the last Friday. |
| `weekday` | 0–6; `monthMode: "weekday"` | |

A rule without the optional fields behaves exactly as before:

- weekly adds 7 × N days;
- monthly keeps the day of the month, clamped to shorter months.

A field that does not fit its frequency or is invalid is dropped on normalization, so the rule falls back to that behavior.

## The next occurrence

- **`Core.nextRecurrenceDate(date, rule)`:**
  - daily adds N days;
  - weekly with `weekdays` takes the next listed day later in the same Monday-based week, or else the first listed day N weeks on;
  - monthly takes the rule's day or the nth weekday N months on;
  - yearly takes the same month and day N years on (29 February falls on 28 February in other years).
- **`Core.firstRecurrenceDate(start, rule)`** is the first matching day on or after `start`. It gives "the first time is the first matching day from the start" (S15).
- **`Core.upcomingRecurrenceDates(start, rule, count)`** gives the next dates the editor shows, honoring the rule's end.
- **Completing a task with an extended rule:**
  - its plan day (or else its due day) moves to the next occurrence;
  - its due day and reminder keep their distance to it, so a deadline a day after the plan day stays a day after;
  - rules without the new fields keep today's advance, field by field.

## Validation and compatibility

- **Backups:**
  - `Backup.validateDomain` accepts `yearly` and the optional fields with the ranges above, and rejects anything else in them.
  - Template data (`recurrence` inside a task template) accepts the same.
  - Backups made before R11a validate unchanged.
- **Templates:** `Core.templateFromEntity` carries the new fields into task templates, and instantiating a template keeps them.
- **Data:** nothing is migrated. Existing rules keep their meaning. `ZIP backupVersion`, schema V3 and IndexedDB v1 are unchanged.
- **Older versions:** a device on an earlier alpha drops a rule it does not know (`yearly`) or its extra fields when it saves that task. All beta devices update through the service worker. The note stays here and in the ledger.

## Tests (written first)

`tests/redesign-r11a.test.js`:

- normalization keeps valid fields and drops invalid ones;
- `nextRecurrenceDate` for each mode, including intervals, month ends, the last day, the nth and last weekday, leap years and Monday-based weeks;
- `firstRecurrenceDate` and `upcomingRecurrenceDates` with an end;
- the next task keeping the due-day and reminder distance;
- legacy rules unchanged;
- backup and template validation;
- template round trip;
- the version `2.0.0-alpha.26`.
