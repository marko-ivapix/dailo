# Dailo V1.9 Design Specification — Beta-ready

**Date:** 2026-10-07
**Status:** Draft — waiting for user approval of the open questions below
**Baseline:** V1.8 on `main` (`5e4ba82`)
**Roadmap:** `docs/superpowers/plans/2026-10-07-release-roadmap.md` (Phase 1)
**Plan:** `docs/superpowers/plans/2026-10-07-todo-v1-9.md` (written after approval)
**Ledger:** `docs/superpowers/progress-v1-9.md` (created with the plan)

## Goal

Make Dailo safe to hand to a small Serbian-speaking beta group on iPhone Safari: installable to the Home Screen, usable offline, resistant to silent data loss, in Serbian, with a visible version and a way to report problems. Dailo stays local-first: no backend, accounts or sync. Those arrive with the mobile app in V2.0.

## User decisions (2026-10-07)

| Topic | Decision |
| --- | --- |
| Primary beta device | iPhone, Safari |
| UI language | Serbian, Latin script (`sr-Latn`) |
| Backend | None in V1.9 |
| Beta timing | After V1.9 and the manual acceptance pass |

## Non-negotiable constraints

V1.9 keeps every V1.8 contract (`docs/superpowers/specs/2026-10-07-todo-v1-8-design.md`, "Non-negotiable constraints") except the explicit, narrow changes listed here.

| Area | V1.9 rule |
| --- | --- |
| Architecture | Static HTML/CSS/vanilla JavaScript, classic scripts, no framework, no build step. New files are classic scripts (`js/i18n.js`, `js/i18n-sr.js`), a service worker (`sw.js`), a manifest, icons and vendored font/icon assets. No new runtime library. |
| Persistence | `todoAppData` V3 schema and IndexedDB `todoAppDB` v1 unchanged; ZIP stays `backupVersion: 2`. New settings fields are optional, have no default in `normalizeV16Settings` and are validated in `js/backup.js`. No key or ID renamed. |
| Search | Scope, ranking, grouping and keyboard behavior unchanged. **Exception (needs approval):** the Search modal's fixed UI strings may be wrapped in `t()` so the beta UI is fully Serbian. |
| Typed confirmations | The typed words stay exactly `RESET` and `RESTORE`; only the surrounding explanation is translated. |
| Bulk actions, deletion, navigation, capture, Task Properties, density, accessibility | Unchanged. |

## Workstreams

### A. Install to Home Screen (PWA)

- `manifest.webmanifest`: `name`/`short_name` "Dailo", `lang` "sr-Latn", `start_url` "./", `scope` "./", `display` "standalone", `background_color` and `theme_color` `#0F1114` (the V1.8 canvas), icons 192 px and 512 px plus a 512 px `maskable` icon.
- `index.html`:
  - Add `<link rel="manifest">` and `<link rel="apple-touch-icon">` (180 px).
  - Add `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` "Dailo" and `apple-mobile-web-app-status-bar-style` `black-translucent`.
  - Add `viewport-fit=cover` to the viewport meta. Today the CSS uses `env(safe-area-inset-bottom/left/right)` 14 times, but these evaluate to 0 without `viewport-fit=cover`. Add top-inset padding to the shell header so content clears the status bar in standalone mode.
- All paths are relative, so the app works under the GitHub Pages sub-path `/dailo/`.
- Icons: a geometric "D" mark in the V1.8 primary blue on the graphite canvas. The source is SVG; PNG exports are committed (Pillow/ImageMagick are available in the build environment).
- iOS Safari has no install prompt. Settings gets an "Instaliraj aplikaciju" row:
  - When not standalone (`navigator.standalone !== true` and `(display-mode: standalone)` does not match), it shows three steps: Share → "Dodaj na početni ekran" → "Dodaj".
  - When standalone, it shows "Instalirano".

### B. Data protection

- **Persistent storage.**
  - Feature-detect `navigator.storage?.persist`.
  - Request persistence after the first successful save in a session and from a Settings button. Never request it on page load without user activity.
  - Settings → Data shows "Trajno čuvanje: uključeno / nije odobreno / nije podržano" and, when available, usage from `navigator.storage.estimate()`.
- **Backup reminder.** It builds on the existing `settings.backupStatus.lastExport`, which `exportBackupAction` writes after a successful export (`js/app.js:3334`).
  - A new optional preference `backupReminderDays` (integer 0–90, where 0 means off) is read as 7 when missing. It is validated in the settings block of `js/backup.js` and edited in Settings → Data. It gets no default in `normalizeV16Settings`, because `tests/core-v1-6.test.js:10` compares the whole normalized object.
  - Reference date: `backupStatus.lastExport`. If there was never an export, use the oldest `createdAt` among Tasks, Goals, Habits, Notes and Resources. With no user data there is no reminder.
  - Known effects of the existing status model are accepted because they can only cause an *extra* reminder, never a missed one:
    - a restore adopts the backup's older status;
    - a reset clears it;
    - safety ZIPs do not count;
    - a write is skipped on a concurrent change.
  - When overdue, Today shows one dismissible notice: "Napravite rezervnu kopiju podataka" with a one-tap export. "Podseti me sutra" snoozes it for 24 h; the snooze time is a device-local localStorage key and is not part of state or backups. The notice never blocks the UI and never appears inside modals.
  - Settings shows `lastExport` as a formatted local date instead of the raw ISO string (`js/settings-ui.js:42`).

### C. Offline start

- Vendor the CDN assets, each with its license file:
  - **Fonts** in `vendor/fonts/`: Geist and Space Grotesk variable fonts, `latin` and `latin-ext` subsets (Serbian Latin needs `č ć đ š ž`). Source: `@fontsource-variable/geist@5.3.0` and `@fontsource-variable/space-grotesk@5.3.0` (OFL-1.1, about 87 KB in total). The variable axis also supplies the Geist 700 weight that `css/styles.css` uses today but Google Fonts never loads.
  - **Icons** in `vendor/phosphor/`: regular and fill from `@phosphor-icons/web@2.1.1` (MIT). The two `.woff2` files are about 279 KB; their CSS is rewritten to reference only the local `.woff2`. Icon names persisted in Area data (`AREA_ICONS`, `js/app.js:13`) must keep working, so no subsetting in V1.9.
  - Remove the Google Fonts and unpkg `<link>`s and preconnects.
- Add `sw.js` at the repository root (scope `./`).
  - **Precache** the app shell: `index.html`, `css/styles.css`, all `js/*.js`, runtime `vendor/**` files, the manifest and the icons. The list is a single array, and a Node test compares it with the files `index.html` and the CSS reference, so a missing file fails the suite.
  - **Cache naming:** `dailo-shell-<APP_VERSION>`. `activate` deletes older `dailo-shell-*` caches.
  - **Fetch:** precached shell files are served cache-first. Every other request goes to the network untouched; non-GET, `blob:`/`data:` URLs and downloads are never intercepted.
  - **Updates:** a new worker waits. The page shows "Dostupna je nova verzija — Osveži", and only that action posts `skipWaiting` and reloads. The page never reloads silently while the user is editing.
  - **Registration** happens only on `https:` or `localhost`, never in Node tests.
- Reminders still fire only while the app is open (`checkReminders`, 30 s interval, `js/app.js:4371`). Push needs a server, so Settings → Obaveštenja states this limitation.

### D. ID generation fallback

- Item IDs come from `uid()` (`js/app.js:159`), which uses `Date.now()` + `Math.random()` and already works in insecure contexts.
- The only runtime path that needs `crypto.randomUUID` is `splitRecurrenceForFuture` (`js/core.js:374`), used when editing a recurring series "this and future" (`js/app.js:2148,2162`). The default `makeId` in `instantiateTemplate` (`js/core.js:112`) has the same dependency but is not reached at runtime.
- Add one `Core.makeUuid()` helper:
  1. use `crypto.randomUUID()` when available;
  2. otherwise build an RFC 4122 v4 UUID from `crypto.getRandomValues()`;
  3. otherwise fall back to `Math.random()`.

  Use it at both call sites. ID formats do not change.
- This corrects the release roadmap, which said item creation fails outside secure contexts.

### E. App version and problem reports

- Add one constant, `APP_VERSION = '1.9.0'`, in a small shared place reachable by both the app and Settings. It feeds:
  - the document title and brand tooltip (today hard-coded "v1.8" at `index.html:8` and `js/app.js:850`);
  - Settings;
  - `sw.js` (a Node test asserts the two values match).
- The backup manifest gains `releaseVersion: APP_VERSION`. The historical `appVersion: '1.3'` (`js/backup.js:85`) stays, because tests and docs assert it.
- Settings → "O aplikaciji" shows:
  - the version;
  - "Prijavi problem";
  - a one-line privacy note: "Podaci ostaju samo na ovom uređaju".
- "Prijavi problem" opens a prefilled report with version, user agent, standalone yes/no and the persistence state. It never includes app data. The channel is an open question.

### F. Serbian localization (`sr-Latn`)

Facts that drive the design:
- About 1,000 user-visible English strings: `js/app.js` ~390, `js/habits-ui.js` ~200, `js/goals-ui.js` ~140, `js/templates-ui.js` ~100, the rest under 70 each. This includes ~70 toasts, ~110 attribute strings and seeded sample content.
- No i18n mechanism exists, and `<html lang="en">` is hard-coded.
- Date formatting is mixed:
  - `Intl.DateTimeFormat(undefined, …)` and `toLocale*String(undefined, …)` follow the browser locale (`js/app.js:14-30`, `js/goals-ui.js`, `js/habits-ui.js`);
  - the calendar forces `'en'` (`js/calendar-ui.js:54,61`);
  - weekday names are hard-coded in English arrays (`js/habits-ui.js:60,111,309`, `js/calendar-ui.js:68`).
- `Intl` treats plain `'sr'` as Cyrillic, so the locale must be `sr-Latn-RS`.
- Code builds English grammar: plural `${unit}s` (`js/app.js:210`), `${type}s` (`:758`), and lower/upper-casing label splices (`js/app.js:1546,2432`, `js/calendar-ui.js:56,84`).
- `backupStatus.validationResult` stores English sentences in user data. Error messages from `js/backup.js`/`js/storage.js` reach the UI through `error.message`.
- 14 of 35 Node test files assert English text:
  - Rendered output stays stable if Node runs in English.
  - About 6 regexes match source text (`tests/inbox-v1-6.test.js:28,34`, `tests/accessibility-v1-7.test.js:12-15,51-52`, `tests/modal-ux-v1-6.test.js:29`, `tests/design-v1-8.test.js:329`, `tests/navigation-v1-7.test.js:22`).
  - Several tests cut functions out of `js/app.js` and run them in a `vm` with stub globals (recovery, tasks-today, app-safety, knowledge, core suites).

Design:
1. **Mechanism.**
   - `js/i18n.js` loads before `js/core.js` and exposes `window.TodoI18n = { locale, setLocale, t, plural, formatDate, formatTime, weekdayNames }`.
   - `t(source, params)` uses the **English source string as the key**. It returns the `sr-Latn` catalog entry or the source, with `{name}` interpolation.
   - The catalog lives in `js/i18n-sr.js` as a plain object.
2. **Defensive access.**
   - Modules and `js/app.js` read `const t = globalThis.TodoI18n?.t ?? (s => s)`, so code run in `vm` stubs without i18n stays English and does not throw.
   - Where a test slices a single function that uses `t`, add `t: s => s` to that test's stub. Never weaken an assertion.
   - Function boundary markers that tests slice on stay in place.
3. **Locale preference.**
   - A new optional setting `language` (`'sr'` | `'en'`) is read as `'sr'` when missing. It is validated in `js/backup.js` and switched in Settings → "Jezik".
   - `<html lang>` updates to `sr-Latn` / `en`.
   - Node tests run in English because the catalog is not loaded there.
4. **Dates and numbers.**
   - Replace `undefined` and `'en'` locale arguments with `TodoI18n.locale` (`sr-Latn-RS` or `en`).
   - Replace hard-coded weekday/month arrays with `Intl`-derived names.
   - Format file sizes with the locale's decimal separator.
5. **Grammar.**
   - Replace string splicing with whole-sentence messages.
   - Plurals use `Intl.PluralRules('sr-Latn')` with `one`/`few`/`other` forms (e.g. "1 zadatak", "3 zadatka", "5 zadataka").
6. **Persisted English.**
   - Keep storing the existing English `validationResult` sentences; translate them at display time with `t(value)`. No migration.
   - Translate known fixed error messages at display. Unknown messages pass through.
7. **Sample content.**
   - `createSampleState`, starter examples and cleaning sample rooms create their titles through `t()` in the active language.
   - De-duplication keeps using the stable `sampleKey` markers, not names.
8. **Quick Add.** Serbian keywords are accepted alongside the English ones, with and without diacritics:
   - days: `danas`, `sutra`, `ponedeljak`, `utorak`, `sreda`, `četvrtak`/`cetvrtak`, `petak`, `subota`, `nedelja`;
   - time: `u HH:MM`.

   Other Quick Add syntax (due date, duration, projects) stays in Phase 4.
9. **Completeness checks** (Node tests):
   - every `t('…')` literal in `js/*.js` and `index.html` has an `sr` entry, and the catalog has no unused entries;
   - an "untranslated text" audit flags capitalized English literals in rendered templates that are not wrapped in `t()`. A small allowlist covers brand names, `RESET`/`RESTORE`, key names and the like.
10. **Glossary.**
    - A fixed term list keeps translations consistent (proposal below; the user approves it).
    - Translation is done by Claude. The user reviews it during manual acceptance.
11. **Python browser scenarios** keep using English selectors. They run with `language: 'en'`, and this is documented.
12. **Rollout by surface**, one commit each, full suite green after every step:
    1. shell and navigation;
    2. Today, Inbox and task rows;
    3. Task Properties and modals;
    4. Calendar;
    5. Goals;
    6. Habits;
    7. Areas, Projects, Tags and Cleaning;
    8. Notes and Resources;
    9. Templates and Saved Views;
    10. Settings, Data and recovery;
    11. toasts and errors;
    12. sample content.

Proposed glossary (user approval needed):

| English | Serbian |
| --- | --- |
| Today / Upcoming / Anytime / Completed | Danas / Predstojeće / Bilo kada / Završeno |
| Inbox | Inbox |
| Task / Subtask | Zadatak / Podzadatak |
| Project / Area / Tag | Projekat / Oblast / Oznaka |
| Goal / Milestone / Habit / Routine | Cilj / Etapa / Navika / Rutina |
| Note / Resource / Attachment | Beleška / Resurs / Prilog |
| Calendar / Week / Month / Day | Kalendar / Nedelja / Mesec / Dan |
| Template / Saved view / Cleaning | Šablon / Sačuvani prikaz / Čišćenje |
| Planned / Due / Overdue / Priority | Planirano / Rok / Kasni / Prioritet |
| Quick Add / Search / Settings / More | Brzo dodavanje / Pretraga / Podešavanja / Još |
| Delete / Undo / Archive / Restore | Obriši / Poništi / Arhiviraj / Vrati |
| Backup / Export / Import / Snapshot / Reset | Rezervna kopija / Izvezi / Uvezi / Snimak / Resetuj |
| Reminder / Notifications | Podsetnik / Obaveštenja |

### G. Fixes found while specifying

Each fix starts with a failing test.

1. **Favorite star renders blank.** `js/knowledge.js:10` uses `ph ph-star-fill`, which does not exist in Phosphor web 2.1.1 (checked in the package CSS). Use `ph-fill ph-star`.
2. **Week start is inconsistent.**
   - The default is numeric `1` (`js/core.js:587`), the UI writes `'monday'`/`'sunday'`, and the logic checks only `=== 'sunday'` (`js/core.js:823`, `js/calendar-ui.js:66`). The Settings select treats `0` as Sunday (`js/settings-ui.js:31`).
   - Result: a stored `0` shows "Sunday" but behaves as Monday.
   - Fix: normalize on read to `'monday'`/`'sunday'` and keep accepting the legacy numbers.
3. **Stale Settings → General card.** It shows disabled "Week starts on: Monday" and "Theme: Dark" placeholders (`js/settings-ui.js:9-19`). Remove the week-start placeholder; the working control is under Personalization.

## iOS specifics that shape the design

- **Separate storage.** Safari tabs and Home Screen apps keep separate storage, so data created in a Safari tab does not appear in the installed app.
  - Onboarding and the install row say: install first, then use.
  - Existing Safari data moves by ZIP export in Safari and import in the installed app (existing flow).
- **Storage eviction.** WebKit can delete script-writable storage for sites not visited for 7 days. Installed Home Screen apps are exempt.
  - Installing is the main protection; the persistence request and the backup reminder are backstops.
- **No browser UI** in Home Screen apps. Every screen must be reachable from in-app navigation; this is already true via the sidebar or bottom navigation plus the More sheet.

## Acceptance

Automated (Node), each written failing first:
- Manifest fields, icon files and `index.html` meta/link tags.
- Precache list completeness against `index.html`/CSS references.
- `APP_VERSION` equals the version in `sw.js`, the title and the backup `releaseVersion`.
- `makeUuid` with and without `randomUUID`/`getRandomValues`.
- Backup reminder:
  - due/not-due/snoozed/never-exported/no-data cases;
  - `backupReminderDays` and `language` validation in backup import;
  - round trip.
- Persistence status rendering for granted, denied and unsupported.
- Localization:
  - catalog completeness and untranslated-text audit;
  - Serbian plural forms;
  - `sr-Latn-RS` date output;
  - Serbian Quick Add keywords;
  - English output unchanged in Node.
- Fixes G1–G3.
- The full existing suite stays green; any test edited for `t()` keeps its assertion.

Manual on iPhone Safari (recorded in `docs/superpowers/progress-v1-9.md`):
- Install to the Home Screen.
- Standalone launch with no browser bars and content clear of the status bar and home indicator.
- Airplane-mode launch after one online visit.
- Update prompt after a new deploy.
- Persistence status.
- Backup reminder plus export and import into the installed app.
- Full Serbian UI walkthrough of every route.
- Serbian Quick Add.
- Favorite star.

## Out of scope

- Sync, accounts, backend and push notifications (V2.0).
- The mobile app wrapper (V2.0).
- Phase 4 features: duration/time-blocking UI, extended Quick Add syntax, weekly review.
- Search behavior.
- Cyrillic UI.
- Icon subsetting.
- Changing the historical backup `appVersion`.

## Open questions for the user

1. **Problem reports:** GitHub issue (needs a GitHub account), e-mail to an address you choose, or a form (e.g. Google Forms)?
2. **Glossary:** approve or change the proposed terms above (for example "Inbox" vs "Prijemno", "Etapa" vs "Prekretnica").
3. **Search exception:** allow translating the Search modal's fixed labels (behavior untouched)?
4. **Backup reminder default:** every 7 days?
5. **Language switch:** keep English selectable in Settings (useful for testing), or Serbian only?

## Implementation order

1. Fixes G1–G3 and D (small and independent).
2. E: version constant and Settings "O aplikaciji".
3. B: data protection.
4. A: manifest, icons and iOS meta.
5. C: vendored assets and service worker.
6. F: localization, surface by surface.
7. Final verification, V1.9 package, manual iPhone pass.
