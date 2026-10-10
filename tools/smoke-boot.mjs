// Boot smoke test of the real page in jsdom (npm run smoke): index.html with every script, then one full
// user flow — create a task in Quick Add, "close" the app, open it again on the same storage, find the task.
// It catches load-order mistakes and script errors the unit tests cannot see. It is not a browser or device
// check: IndexedDB uses the app's in-memory test database, and layout, fonts and touch are not exercised.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsdom from 'jsdom';

const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = { '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
// Every request is answered from the repository, so the smoke test never touches the network.
const repoFiles = requestInterceptor(request => {
  const file = path.join(root, decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, ''));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response('', { status: 404 });
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' } });
});

async function boot(storage) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', error => errors.push(String(error?.stack || error).split('\n')[0]));
  virtualConsole.on('jsdomError', error => errors.push(String(error?.message || error)));
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'http://localhost/index.html', runScripts: 'dangerously', resources: { interceptors: [repoFiles] }, pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      window.__TODO_TEST_MEMORY_DB__ = true;
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      for (const [key, value] of storage) window.localStorage.setItem(key, value);
    },
  });
  await new Promise(resolve => dom.window.addEventListener('load', resolve));
  for (let i = 0; i < 300 && !dom.window.TodoApp; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
  if (!dom.window.TodoApp) throw new Error(`TodoApp did not start: ${errors.join(' | ')}`);
  await dom.window.TodoApp.ready;
  return { dom, window: dom.window, errors };
}

const keep = window => new Map(Object.keys(window.localStorage).map(key => [key, window.localStorage.getItem(key)]));
const fail = message => { console.error(`smoke: FAIL — ${message}`); process.exit(1); };

const first = await boot(new Map());
const { window } = first;
if (!window.TodoApp.state) fail('no state after start');
if (window.DailoPlatform?.kind !== 'web') fail(`platform is ${window.DailoPlatform?.kind}`);
const title = `Smoke ${Date.now()}`;
window.TodoApp.openQuickAdd();
const input = window.document.querySelector('#quick-title');
if (!input) fail('Quick Add did not open');
input.value = title;
input.dispatchEvent(new window.Event('input', { bubbles: true }));
window.document.querySelector('[data-action="create-task"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (!window.TodoApp.state.tasks.some(task => task.title === title)) fail('the task was not created');
// Android Back (M4): it closes the open dialog, then reports nothing left to close.
window.TodoApp.openQuickAdd();
if (!window.document.querySelector('#quick-title')) fail('Quick Add did not reopen');
if (window.TodoApp.handleBackButton() !== true || window.document.querySelector('#quick-title')) fail('Back did not close Quick Add');
if (window.TodoApp.handleBackButton() !== false) fail('Back reported a closed overlay when none was open');
// A-2 (M12): a route change names the page and focuses its heading; a re-render keeps the focused control.
window.location.hash = '#inbox';
await new Promise(resolve => setTimeout(resolve, 50));
const heading = window.document.querySelector('#main .page-title');
if (!/ · Dailo$/.test(window.document.title) || window.document.activeElement !== heading) fail(`route change: title "${window.document.title}", focus ${window.document.activeElement?.tagName}`);
// Redesign R1: "Još" is a screen reached from the bottom bar; its rows open the other screens.
window.document.querySelector('#mobile-bottom-nav [data-route="more"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
const goalsRow = window.document.querySelector('#main .more-row[data-route="goals"]');
if (!goalsRow) fail('the Još screen has no Ciljevi row');
goalsRow.focus();
window.TodoApp.render();
if (!window.document.activeElement?.matches?.('#main .more-row[data-route="goals"]')) fail(`focus was lost on re-render (${window.document.activeElement?.tagName})`);
goalsRow.ownerDocument.querySelector('#main .more-row[data-route="goals"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (window.location.hash !== '#goals' || !window.document.querySelector('#mobile-bottom-nav [data-route="more"]').classList.contains('is-active')) fail('Ciljevi did not open under Još');
// Redesign R2: Today shows "Planirano danas" and compact habit rows; a tap on the round check checks in.
// The first run has no habits, so the demo examples come from Settings first.
window.location.hash = '#settings';
await new Promise(resolve => setTimeout(resolve, 50));
window.document.querySelector('#main [data-action="add-starter-examples"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
for (let i = 0; i < 100 && !window.TodoApp.state.habits.length; i += 1) await new Promise(resolve => setTimeout(resolve, 20));
await new Promise(resolve => setTimeout(resolve, 100));
window.location.hash = '#today';
await new Promise(resolve => setTimeout(resolve, 50));
if (!window.document.querySelector('#main [data-today-section="today"]')) fail('Today has no "Planirano danas" section');
const habitCheck = window.document.querySelector('#main .habit-today-row .habit-check[aria-pressed="false"]');
if (!habitCheck) fail('Today shows no open checkbox habit');
const habitId = habitCheck.dataset.habitId;
habitCheck.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const habitDone = () => window.TodoApp.state.habitLogCache?.[habitId]?.some(log => log.status === 'done');
for (let i = 0; i < 50 && !habitDone(); i += 1) await new Promise(resolve => setTimeout(resolve, 20));
await new Promise(resolve => setTimeout(resolve, 50));
// A done habit moves to the bottom (T5), so it may sit behind "Prikaži još"; the section count shows it.
if (!habitDone() || !/^1\//.test(window.document.querySelector('#main [data-today-section="habits"] .section-count')?.textContent || '')) fail('the habit check did not mark the habit done');
window.location.hash = '#tasks';
await new Promise(resolve => setTimeout(resolve, 50));
const hasSuggestion = window.TodoCore.deriveTodaySections(window.TodoApp.state.tasks, window.TodoCore.dateOnly()).suggestions.length > 0;
if (hasSuggestion !== Boolean(window.document.querySelector('#main [data-tasks-suggestions]'))) fail('the Zadaci suggestions card does not match the suggestions');
window.document.querySelector('#main [data-action="tasks-view"][data-view="projects"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
if (window.TodoApp.state.ui.tasksView !== 'projects' || !window.document.querySelector('#main .project-row[data-route^="project/"]')) fail('the Zadaci switch did not show the projects');
// Redesign R5: a project row opens the project screen with "‹ Zadaci".
window.document.querySelector('#main .project-row[data-route^="project/"]:not([data-route="project/none"])').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (!window.document.querySelector('#main .screen-back[data-route="tasks"]') || !window.document.querySelector('#main .project-title')) fail('the project screen has no "‹ Zadaci" or title');
// Redesign R3: the task window's Planirano row opens the date sheet; Sutra and "Primeni" plan the task.
window.location.hash = '#inbox';
await new Promise(resolve => setTimeout(resolve, 50));
const created = window.TodoApp.state.tasks.find(task => task.title === title);
window.document.querySelector(`#main .task-main[data-task-id="${created.id}"]`)?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
const planRow = window.document.querySelector('#modal-root .task-window-row[data-action="task-plan-picker"]');
if (!planRow) fail('the task window has no Planirano row');
planRow.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const sheet = window.document.querySelector('.popover.popover--sheet');
if (!sheet?.querySelector('.sheet-header .sheet-close') || !window.document.querySelector('.sheet-backdrop')) fail(`the date sheet did not open as a bottom sheet: ${window.document.querySelectorAll('.popover').length} popovers, modal ${window.document.querySelector('#modal-root')?.innerHTML.slice(0, 200)} errors ${first.errors.join(' | ')}`);
const tomorrow = window.TodoCore.addDays(window.TodoCore.dateOnly(), 1);
sheet.querySelector(`.quick-chip[data-date="${tomorrow}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
window.document.querySelector('.popover [data-pop-action="date-sheet-apply"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (window.TodoApp.state.tasks.find(task => task.id === created.id)?.plannedDate !== tomorrow || window.document.querySelector('.popover')) fail('the date sheet did not plan the task for tomorrow');
window.TodoApp.handleBackButton();
// Redesign R4: Quick Add's place sheet; "Bez projekta" keeps a task without a date out of Inbox.
window.TodoApp.openQuickAdd();
window.document.querySelector('#modal-root [data-action="quick-project-picker"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
window.document.querySelector('.popover [data-pop-action="quick-place"][data-place="none"]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const placed = window.document.querySelector('#quick-title');
if (!placed || window.document.querySelector('[data-quick-place-label]')?.textContent !== 'Bez projekta') fail('Quick Add did not take "Bez projekta"');
placed.value = `Smoke bez projekta ${Date.now()}`;
placed.dispatchEvent(new window.Event('input', { bubbles: true }));
window.document.querySelector('[data-action="create-task"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (window.TodoApp.state.tasks.find(task => task.title === placed.value)?.isInbox !== false) fail('a "Bez projekta" task went to Inbox');
// Redesign R6: Inbox → "Razvrstaj redom" → Danas plans the shown task for today and leaves Inbox.
window.TodoApp.openQuickAdd();
const inboxTitle = window.document.querySelector('#quick-title');
inboxTitle.value = `Smoke inbox ${Date.now()}`;
inboxTitle.dispatchEvent(new window.Event('input', { bubbles: true }));
window.document.querySelector('[data-action="create-task"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
window.location.hash = '#inbox';
await new Promise(resolve => setTimeout(resolve, 50));
window.document.querySelector('#main [data-action="inbox-triage"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const triageToday = window.document.querySelector('#modal-root .inbox-triage-actions [data-action="inbox-today"]') || [...window.document.querySelectorAll('#modal-root .inbox-triage-actions [data-action="inbox-triage-skip"]')][0];
const triaged = triageToday?.dataset.taskId;
if (!triaged) fail('"Razvrstaj redom" did not show a task first');
triageToday.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
const sortedTask = window.TodoApp.state.tasks.find(task => task.id === triaged);
if (sortedTask?.plannedDate !== window.TodoCore.dateOnly() || sortedTask.isInbox) fail('Danas in "Razvrstaj redom" did not plan the task for today');
window.TodoApp.handleBackButton();
// Redesign R7: Kalendar opens on today with a dot; a picked day lists its task in Lista, and Raspored shows the day view.
window.location.hash = '#calendar';
await new Promise(resolve => setTimeout(resolve, 50));
const todayStrip = window.document.querySelector(`#main .calendar-strip-day.is-selected[data-calendar-date="${window.TodoCore.dateOnly()}"]`);
if (!todayStrip || todayStrip.querySelector('.calendar-dot.is-empty')) fail('the Calendar did not open on today with a dot');
let tomorrowHeading = window.document.querySelector(`#main .calendar-strip-heading[data-date="${tomorrow}"]`);
if (!tomorrowHeading) {
  window.document.querySelector('#main [data-action="calendar-next"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 50));
  tomorrowHeading = window.document.querySelector(`#main .calendar-strip-heading[data-date="${tomorrow}"]`);
}
tomorrowHeading?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (!window.document.querySelector(`#main .calendar-day-panel[data-calendar-day="${tomorrow}"] [data-task-id="${created.id}"]`)) fail('the picked day does not list its task');
window.document.querySelector('#main [data-action="calendar-day-mode"][data-mode="schedule"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (!window.document.querySelector('#main .calendar-day-panel .day-view')) fail('Raspored did not show the day view');
// Redesign R8a: Navike opens on today in Dan; a past ring opens that day; Nedelja shows the table.
window.location.hash = '#habits';
await new Promise(resolve => setTimeout(resolve, 50));
if (!window.document.querySelector('#main .habit-ring.is-today.is-selected')) fail('Navike did not open on today');
const pastRing = [...window.document.querySelectorAll('#main .habit-ring:not(.is-today):not([disabled])')].at(-1);
if (pastRing) {
  pastRing.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 50));
  if (!window.document.querySelector('#main .habits-day-title') || !window.document.querySelector('#main .habit-ring.is-selected:not(.is-today)')) fail('a past ring did not open that day');
}
window.document.querySelector('#main [data-action="habits-view"][data-view="week"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (!window.document.querySelector('#main .habits-week-table .habit-cell') || !window.document.querySelector('#main .habits-chart-svg')) fail('Nedelja shows no table or the chart is missing');
// Redesign R8b: "+" → Navika → a name, Brojevno, Učestalost → Određeni dani → Primeni → Napravi naviku.
const click = selector => window.document.querySelector(selector)?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const type = (selector, value) => { const field = window.document.querySelector(selector); field.value = value; field.dispatchEvent(new window.Event('input', { bubbles: true })); };
click('#mobile-quick-add-menu [data-action="new-habit"]');
await new Promise(resolve => setTimeout(resolve, 20));
const habitName = `Smoke voda ${Date.now()}`;
type('#habit-name', habitName);
click('#modal-root [data-action="habit-draft-tracking"][data-value="numeric"]');
type('#habit-target-value', '2');
type('#habit-unit', 'l');
click('#modal-root [data-action="habit-draft-frequency"]');
click('.popover [data-pop-action="habit-freq-type"][data-value="weekdays"]');
click('.popover [data-pop-action="habit-freq-apply"]');
if (window.document.querySelector('#modal-root [data-action="habit-draft-frequency"] .task-window-row-value')?.textContent !== 'Radnim danima') fail('the frequency sheet did not set the working days');
click('#modal-root [data-action="save-habit"]');
await new Promise(resolve => setTimeout(resolve, 50));
const newHabit = window.TodoApp.state.habits.find(habit => habit.name === habitName);
if (!newHabit || newHabit.trackingType !== 'numeric' || newHabit.frequencyType !== 'weekdays' || newHabit.weekdays.join() !== '1,2,3,4,5' || newHabit.quickValues.join() !== '0.25,0.5,1' || window.document.querySelector('#modal-root .habit-window')) fail('"Napravi naviku" did not create the habit from the window');
// Redesign R8c: Today → the habit's menu → Detalji navike → today's day in the calendar → X; an old #habit/ address opens the window too.
window.location.hash = '#today';
await new Promise(resolve => setTimeout(resolve, 50));
const detailsId = window.document.querySelector('#main .habit-today-row .habit-check[aria-pressed]')?.closest('.habit-today-row')?.dataset.habitId;
if (!detailsId) fail('Today shows no checkbox habit row');
click(`#main .habit-today-row[data-habit-id="${detailsId}"] [data-action="habit-today-menu"]`);
click('.popover [data-pop-action="habit-today-details"]');
await new Promise(resolve => setTimeout(resolve, 20));
if (!window.document.querySelector('#modal-root .habit-details .habit-details-calendar')) fail('Detalji navike did not open the window');
const dayStatus = () => window.TodoApp.state.habitLogCache?.[detailsId]?.find(log => log.date === window.TodoCore.dateOnly())?.status;
const beforeToggle = dayStatus();
click(`#modal-root .habit-details-calendar [data-date="${window.TodoCore.dateOnly()}"]`);
for (let i = 0; i < 50 && dayStatus() === beforeToggle; i += 1) await new Promise(resolve => setTimeout(resolve, 20));
if (dayStatus() === beforeToggle || !window.document.querySelector('#modal-root .habit-details')) fail('the calendar day did not change the history in the window');
click('#modal-root .habit-details [data-action="close-modal"]');
if (window.document.querySelector('#modal-root .habit-details')) fail('X did not close the details window');
window.location.hash = `#habit/${detailsId}`;
await new Promise(resolve => setTimeout(resolve, 50));
if (window.location.hash !== '#habits' || !window.document.querySelector('#modal-root .habit-details')) fail('an old habit address did not open the details window over Navike');
click('#modal-root .habit-details [data-action="close-modal"]');
// Redesign R9a: Ciljevi → Rok shows month groups. R9b: a row opens the goal window; Ciljni datum → Za mesec dana → Primeni.
window.location.hash = '#goals';
await new Promise(resolve => setTimeout(resolve, 50));
if (!window.document.querySelector('#main .goals-summary') || !window.document.querySelector('#main .goals-group[data-goal-group="short"] .goal-list-row')) fail('Ciljevi has no summary or horizon groups');
click('#main [data-action="goals-group"][data-view="date"]');
await new Promise(resolve => setTimeout(resolve, 20));
if (!window.document.querySelector('#main .goals-group[data-goal-group^="20"]')) fail('Rok did not group the goals by month');
const goalRow = window.document.querySelector('#main .goal-list-row');
const goalRoute = goalRow?.dataset.route;
goalRow?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (window.location.hash !== '#goals' || !window.document.querySelector('#modal-root .goal-details .goal-details-progress')) fail('a goal row did not open the goal window');
const goalId = goalRoute?.slice('goal/'.length);
click('#modal-root .goal-details [data-action="goal-details-date"]');
click('.popover [data-pop-action="goal-date-pick"]');
click('.popover [data-pop-action="goal-date-apply"]');
await new Promise(resolve => setTimeout(resolve, 20));
if (window.TodoApp.state.goals.find(goal => goal.id === goalId)?.targetDate !== window.TodoCore.addDays(window.TodoCore.dateOnly(), 30) || !window.document.querySelector('#modal-root .goal-details')) fail('Za mesec dana → Primeni did not set the target date in the window');
click('#modal-root .goal-details [data-action="close-modal"]');
window.location.hash = `#goal/${goalId}`;
await new Promise(resolve => setTimeout(resolve, 50));
if (window.location.hash !== '#goals' || !window.document.querySelector('#modal-root .goal-details')) fail('an old goal address did not open the goal window over Ciljevi');
click('#modal-root .goal-details [data-action="close-modal"]');
// Redesign R9c: on Ciljevi the "+" opens Novi cilj → a name, Broj with a target and unit, Ciljni datum → Kraj godine → Primeni → Napravi cilj.
if (window.document.querySelector('#mobile-quick-add-toggle')?.getAttribute('aria-label') !== 'Novi cilj') fail('the floating "+" on Ciljevi does not say "Novi cilj"');
click('#mobile-quick-add-toggle');
await new Promise(resolve => setTimeout(resolve, 20));
if (!window.document.querySelector('#modal-root .goal-window') || !window.document.querySelector('#mobile-quick-add-menu')?.hidden) fail('the "+" on Ciljevi did not open Novi cilj directly');
const goalName = `Smoke cilj ${Date.now()}`;
type('#goal-title', goalName);
click('#modal-root [data-action="goal-draft-type"][data-value="numeric"]');
type('#goal-target', '12');
type('#goal-unit', 'knjiga');
click('#modal-root [data-action="goal-draft-date"]');
click('.popover [data-pop-action="goal-date-pick"]:last-of-type');
click('.popover [data-pop-action="goal-date-apply"]');
click('#modal-root [data-action="save-goal"]');
await new Promise(resolve => setTimeout(resolve, 50));
const newGoal = window.TodoApp.state.goals.find(goal => goal.title === goalName);
if (!newGoal || newGoal.progressType !== 'numeric' || newGoal.targetValue !== 12 || newGoal.unit !== 'knjiga' || newGoal.targetDate !== `${window.TodoCore.dateOnly().slice(0, 4)}-12-31` || window.document.querySelector('#modal-root .goal-window') || window.location.hash !== '#goals') fail('"Napravi cilj" did not create the numeric goal and stay on Ciljevi');
// Redesign R10a: Još → Oblasti → "+ Nova oblast" → a name → Napravi oblast → the area → "+" of Zadaci files a task in it.
click('#mobile-bottom-nav [data-route="more"]');
await new Promise(resolve => setTimeout(resolve, 50));
click('#main .more-row[data-route="areas"]');
await new Promise(resolve => setTimeout(resolve, 50));
if (window.location.hash !== '#areas' || !window.document.querySelector('#main .areas-list') || window.document.querySelector('#main [role="tablist"]')) fail('Oblasti did not show the area card without tabs');
click('#main .areas-list [data-action="new-area"]');
await new Promise(resolve => setTimeout(resolve, 20));
const areaName = `Smoke oblast ${Date.now()}`;
type('#area-name', areaName);
click('#modal-root .area-window [data-action="save-area"]');
await new Promise(resolve => setTimeout(resolve, 50));
const newArea = window.TodoApp.state.areas.find(area => area.name === areaName);
if (!newArea || window.document.querySelector('#modal-root .area-window') || !window.document.querySelector(`#main .area-list-row[data-route="area/${newArea.id}"]`)) fail('Napravi oblast did not add the area to Oblasti');
click(`#main .area-list-row[data-route="area/${newArea.id}"]`);
await new Promise(resolve => setTimeout(resolve, 50));
if (!window.document.querySelector('#main .area-empty-hint') || window.document.querySelectorAll('#main .area-section').length !== 5) fail('the empty area did not show its hint and five sections');
click('#main .area-section [data-action="area-new-task"]');
await new Promise(resolve => setTimeout(resolve, 20));
const areaTaskTitle = `Smoke zadatak oblasti ${Date.now()}`;
type('#quick-title', areaTaskTitle);
click('[data-action="create-task"]');
await new Promise(resolve => setTimeout(resolve, 50));
if (window.TodoApp.state.tasks.find(task => task.title === areaTaskTitle)?.areaId !== newArea.id || !window.document.querySelector('#main .area-section .task-list')) fail('the "+" of Zadaci did not file the task in the area');
// Redesign R10b: Još → Beleške → "+" says "Nova beleška" → a name and text → Napravi belešku → the window stays → X → the list.
click('#mobile-bottom-nav [data-route="more"]');
await new Promise(resolve => setTimeout(resolve, 50));
click('#main .more-row[data-route="notes"]');
await new Promise(resolve => setTimeout(resolve, 50));
if (window.location.hash !== '#notes' || !window.document.querySelector('#main .knowledge-chips') || window.document.querySelector('#main select')) fail('Beleške did not show the filter chips');
if (window.document.querySelector('#mobile-quick-add-toggle')?.getAttribute('aria-label') !== 'Nova beleška') fail('the floating "+" on Beleške does not say "Nova beleška"');
click('#mobile-quick-add-toggle');
await new Promise(resolve => setTimeout(resolve, 20));
if (!window.document.querySelector('#modal-root .knowledge-window [data-action="save-knowledge"]')) fail('the "+" on Beleške did not open the note window');
const noteName = `Smoke beleška ${Date.now()}`;
type('#knowledge-title', noteName);
type('#knowledge-text', 'Samo tekst');
click('#modal-root [data-action="save-knowledge"]');
await new Promise(resolve => setTimeout(resolve, 50));
const newNote = window.TodoApp.state.notes.find(note => note.title === noteName);
if (!newNote || newNote.body !== 'Samo tekst' || newNote.linkUrls.length || !window.document.querySelector('#modal-root .knowledge-window [data-action="knowledge-menu"]')) fail('Napravi belešku did not keep the window open on a text-only note');
click('#modal-root .knowledge-window [data-action="close-modal"]');
await new Promise(resolve => setTimeout(resolve, 20));
if (window.document.querySelector('#modal-root .knowledge-window') || !window.document.querySelector(`#main .knowledge-row [data-route="note/${newNote.id}"]`)) fail('the new note is not in the list after X');
window.dispatchEvent(new window.Event('pagehide'));
const saved = keep(window);
first.dom.window.close();

const second = await boot(saved);
const found = second.window.TodoApp.state.tasks.find(task => task.title === title);
if (!found) fail('the task is missing after reopening');
const errors = [...first.errors, ...second.errors];
second.dom.window.close();
if (errors.length) fail(`script errors: ${errors.join(' | ')}`);
console.log(`smoke: OK — started, created "${title}", Back closed Quick Add, route change named the page and focused its heading, Još opened Ciljevi, focus survived a re-render, Today checked in a habit, the Zadaci switch showed the projects and opened one, the task window's date sheet planned a task, Quick Add filed a task under \"Bez projekta\", \"Razvrstaj redom\" planned an Inbox task for today, the Calendar listed a picked day and its Raspored, Navike opened a past day and Nedelja, the new habit window created a numeric weekday habit, Detalji navike changed a day and an old address opened the window, Ciljevi grouped by month, the goal window set a target date and an old address opened it, the \"+\" on Ciljevi created a numeric goal, Oblasti made an area and its \"+\" filed a task there, Beleške made a text-only note in its window, reopened and found it (tasks: ${second.window.TodoApp.state?.tasks?.length ?? 'n/a'})`);
process.exit(0);
