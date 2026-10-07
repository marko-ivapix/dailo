from pathlib import Path
import shutil
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = [(ROOT / path).read_text() for path in [
    'vendor/jszip.min.js', 'js/core.js', 'js/storage.js', 'js/attachments.js', 'js/backup.js',
    'js/domain-modules.js', 'js/knowledge.js', 'js/goals-ui.js', 'js/habits-ui.js', 'js/saved-views-ui.js',
    'js/projects-ui.js', 'js/areas-ui.js', 'js/settings-ui.js', 'js/templates-ui.js', 'js/calendar-ui.js',
    'js/tasks-ui.js', 'js/cleaning-ui.js', 'js/app.js',
]]
SHELL = '''<!doctype html><html><body>
<div id="app" class="app-shell"><aside id="sidebar" class="sidebar"></aside><main id="main" class="main"></main></div>
<div id="modal-root"></div><div id="toast-root" class="toast-root"></div>
</body></html>'''


def chromium_path():
    # Isolated Playwright Chromium only: never launch the user's Google Chrome profile.
    return (shutil.which('chromium') or shutil.which('chromium-browser')
            or next((str(path) for path in [
                Path('/usr/bin/chromium'), Path('/Applications/Chromium.app/Contents/MacOS/Chromium'),
            ] if path.exists()), None))


def seed_state():
    return {'version': 3, 'tasks': [], 'projects': [], 'tags': [], 'areas': [], 'goals': [], 'habits': [],
            'templates': [], 'savedViews': [], 'settings': {'weekStartsOn': 'monday'}, 'ui': {}}


def boot(page, now='2026-10-31T20:00:00', seed=None):
    page.set_content(SHELL)
    page.evaluate('''([seed, fixedNow]) => {
      const NativeDate = Date; let current = new NativeDate(fixedNow).getTime();
      class TestDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [current])); }
        static now() { return current; }
      }
      window.Date = TestDate;
      window.__TODO_TEST_SET_NOW__ = value => { current = new NativeDate(value).getTime(); };
      window.__TODO_TEST_MEMORY_DB__ = true;
      const data = new Map([['todoAppData', JSON.stringify(seed)]]);
      Object.defineProperty(window, 'localStorage', { value: {
        getItem: key => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), clear: () => data.clear(),
      }, configurable: true });
      location.hash = '#today';
    }''', [seed or seed_state(), now])
    for script in SCRIPTS:
        page.add_script_tag(content=script)
    page.wait_for_selector('.page-title')
    page.evaluate('TodoApp.ready')


def native_calendar(browser):
    """Real styled document and native IndexedDB in a disposable origin/context."""
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    context = None
    try:
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        context.add_init_script('''{
          const NativeDate = Date; let current = new NativeDate('2026-10-31T12:00:00').getTime();
          window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [current])); } static now() { return current; } };
          window.__TODO_TEST_SET_NOW__ = value => { current = new NativeDate(value).getTime(); };
        }''')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        url = f'http://127.0.0.1:{server.server_port}/index.html'
        def ready():
            page.wait_for_function('window.TodoApp && window.TodoStorage && TodoApp.ready')
            page.evaluate('() => TodoApp.ready')
            page.wait_for_selector('.page-title')
        # Seed before any app pagehide saver exists; a same-tab reload of a
        # live sample app would correctly persist its in-memory sample state.
        page.goto(url.replace('/index.html', '/vendor/'), wait_until='domcontentloaded')
        seed = seed_state()
        seed['tasks'] = [
            {'id': 'task-plan-due', 'title': 'Plan and deadline', 'plannedDate': '2026-10-28', 'plannedTime': '09:00', 'dueDate': '2026-10-30', 'dueTime': '17:00'},
            {'id': 'task-same', 'title': 'Same day task', 'plannedDate': '2026-10-29', 'plannedTime': '14:00', 'dueDate': '2026-10-29', 'dueTime': '18:00'},
            {'id': 'task-all-day', 'title': 'All day task', 'plannedDate': '2026-10-29'},
            {'id': 'task-early', 'title': 'Early task', 'plannedDate': '2026-10-29', 'plannedTime': '08:00'},
            {'id': 'task-late', 'title': 'Late task', 'plannedDate': '2026-10-29', 'plannedTime': '16:00'},
        ]
        seed['goals'] = [
            {'id': 'goal-target', 'title': 'Target goal', 'status': 'active', 'targetDate': '2026-10-29', 'progressMode': 'manual', 'currentValue': 0},
            {'id': 'goal-milestone', 'title': 'Milestone parent', 'status': 'active', 'milestones': [{'id': 'milestone-dated', 'title': 'Dated milestone', 'date': '2026-10-29', 'isCompleted': False}]},
            {'id': 'goal-calendar-linked', 'title': 'Calendar linked goal', 'status': 'active', 'progressMode': 'linkedHabits', 'habitLinks': [{'habitId': 'habit-numeric', 'metric': 'totalCheckins', 'target': 1}]},
        ]
        seed['habits'] = [
            {'id': 'habit-check', 'name': 'Wednesday check', 'status': 'active', 'frequencyType': 'weekdays', 'weekdays': [3], 'trackingType': 'checkbox', 'startDate': '2026-10-01'},
            {'id': 'habit-numeric', 'name': 'Thursday numeric', 'status': 'active', 'frequencyType': 'weekdays', 'weekdays': [4], 'trackingType': 'numeric', 'targetValue': 2, 'quickValues': [0.5], 'startDate': '2026-10-01'},
            {'id': 'weekly-native', 'name': 'Weekly native', 'status': 'active', 'frequencyType': 'timesPerWeek', 'timesPerWeek': 2, 'trackingType': 'checkbox', 'startDate': '2026-10-26'},
            {'id': 'habit-burst', 'name': 'Native burst', 'status': 'active', 'frequencyType': 'weekdays', 'weekdays': [5], 'trackingType': 'numeric', 'targetValue': 2, 'quickValues': [0.5], 'startDate': '2026-10-30', 'endType': 'successfulPeriods', 'successfulPeriodsTarget': 1},
            {'id': 'habit-paused', 'name': 'Paused invisible', 'status': 'paused', 'frequencyType': 'daily', 'trackingType': 'checkbox', 'startDate': '2026-10-01'},
            {'id': 'habit-archived', 'name': 'Archived invisible', 'status': 'archived', 'frequencyType': 'daily', 'trackingType': 'checkbox', 'startDate': '2026-10-01'},
        ]
        seed['projects'] = [{'id': 'archived-project', 'name': 'Archived project', 'isArchived': True}]
        seed['tasks'].append({'id': 'completed-calendar-task', 'title': 'Completed dated task', 'projectId': 'archived-project', 'isCompleted': True, 'completedAt': '2026-10-27T09:00:00', 'plannedDate': '2026-10-27'})
        for status in ['paused', 'completed', 'archived']:
            seed['goals'].append({'id': f'goal-{status}', 'title': f'{status} dated goal', 'status': status, 'targetDate': '2026-10-27', 'milestones': [{'id': f'milestone-{status}', 'title': f'{status} completed milestone', 'date': '2026-10-27', 'isCompleted': True}]})
        page.evaluate('seed => localStorage.setItem("todoAppData", JSON.stringify(seed))', seed)
        page.goto(url, wait_until='domcontentloaded')
        ready()
        assert page.evaluate('window.__TODO_TEST_MEMORY_DB__ === undefined')
        assert page.locator('link[href="css/styles.css"]').count() == 1
        page.click('[data-route="calendar"]')
        page.wait_for_function('document.querySelector(".page-title").textContent === "Calendar"')
        assert page.locator('.calendar-week > [data-calendar-date]').count() == 7
        assert page.locator('.calendar-hour-slot').count() == 0
        for column in page.locator('.calendar-week > [data-calendar-date]').all():
            assert column.locator('.calendar-all-day').count() == 1
            assert column.locator('.calendar-timed').count() == 1
            assert column.evaluate('(el) => !!(el.querySelector(".calendar-all-day").compareDocumentPosition(el.querySelector(".calendar-timed")) & Node.DOCUMENT_POSITION_FOLLOWING)')
        def cell(date):
            return page.locator(f'#main [data-calendar-date="{date}"]')
        def item(id, root=None):
            return (root or page.locator('#main')).locator(f'[data-calendar-item-id="{id}"]')
        assert cell('2026-10-29').count() == 1, page.evaluate('({today:TodoCore.dateOnly(), ui:TodoApp.state.ui, dates:[...document.querySelectorAll("[data-calendar-date]")].map(el => el.dataset.calendarDate)})')
        assert item('task-all-day', cell('2026-10-29')).count() == 1, page.evaluate('TodoApp.state.tasks')
        assert item('task-all-day', cell('2026-10-29')).locator('xpath=..').get_attribute('class') == 'calendar-all-day'
        assert cell('2026-10-29').locator('.calendar-timed [data-calendar-item-id]').evaluate_all('(els) => els.map(el => el.dataset.calendarItemId)') == ['task-early', 'task-same', 'task-late']
        assert '09:00' in item('task-plan-due', cell('2026-10-28')).inner_text()
        assert '17:00' in item('task-plan-due', cell('2026-10-30')).inner_text()
        assert item('task-same', cell('2026-10-29')).count() == 1
        assert all(time in item('task-same').inner_text() for time in ['14:00', '18:00'])
        assert item('habit-check', cell('2026-10-28')).count() == 1
        assert item('habit-numeric', cell('2026-10-29')).count() == 1
        assert item('goal-target', cell('2026-10-29')).count() == 1
        assert item('milestone-dated', cell('2026-10-29')).count() == 1
        assert 'is-completed' in (item('completed-calendar-task', cell('2026-10-27')).get_attribute('class') or '').split()
        assert item('habit-paused').count() == item('habit-archived').count() == 0
        for status in ['paused', 'completed', 'archived']:
            assert status in item(f'goal-{status}', cell('2026-10-27')).inner_text().lower()
            assert 'Completed' in item(f'milestone-{status}', cell('2026-10-27')).inner_text()
        for date in ['2026-10-28', '2026-10-30']:
            item('task-plan-due', cell(date)).locator('[data-action="open-task"]').click()
            assert page.locator('#detail-title').input_value() == 'Plan and deadline'
            page.click('[data-action="close-modal"]')
        screenshots = ROOT / '.superpowers/sdd/2026-09-16-todo-v1-3/calendar-screenshots'
        screenshots.mkdir(exist_ok=True)
        page.screenshot(path=str(screenshots / 'week.png'), full_page=True)
        def drag(id, source_date, target_date):
            source = item(id, cell(source_date))
            transfer = page.evaluate_handle('new DataTransfer()')
            try:
                source.dispatch_event('dragstart', {'dataTransfer': transfer})
                target = cell(target_date)
                for event in ['dragenter', 'dragover', 'drop']:
                    target.dispatch_event(event, {'dataTransfer': transfer})
                page.locator('body').dispatch_event('dragend', {'dataTransfer': transfer})
            finally:
                transfer.dispose()
        drag('task-plan-due', '2026-10-28', '2026-10-30')
        page.wait_for_function('JSON.parse(localStorage.getItem("todoAppData")).tasks.find(t => t.id === "task-plan-due").plannedDate === "2026-10-30"')
        assert page.evaluate('TodoApp.state.tasks.find(t => t.id === "task-plan-due").plannedTime') == '09:00'
        assert item('task-plan-due', cell('2026-10-30')).count() == 1
        assert all(time in item('task-plan-due').inner_text() for time in ['09:00', '17:00'])
        assert item('goal-target', cell('2026-10-29')).get_attribute('draggable') != 'true'
        goal_target = page.evaluate('TodoApp.state.goals.find(g => g.id === "goal-target")')
        drag('goal-target', '2026-10-29', '2026-10-30')
        assert page.evaluate('TodoApp.state.goals.find(g => g.id === "goal-target")') == goal_target
        assert item('habit-check').get_attribute('draggable') != 'true'
        schedule = page.evaluate('TodoApp.state.habits.find(h => h.id === "habit-check")')
        drag('habit-check', '2026-10-28', '2026-10-30')
        assert page.evaluate('TodoApp.state.habits.find(h => h.id === "habit-check")') == schedule
        # Independent optional time fields are editable, clearable and durable.
        item('task-same').locator('[data-action="open-task"]').click()
        page.fill('#detail-planned-time', '13:30')
        page.locator('#detail-planned-time').dispatch_event('change')
        page.fill('#detail-due-time', '19:00')
        page.locator('#detail-due-time').dispatch_event('change')
        page.fill('#detail-due-time', '')
        page.locator('#detail-due-time').dispatch_event('change')
        assert page.evaluate('TodoApp.state.tasks.find(t => t.id === "task-same").dueTime') is None
        assert page.evaluate('TodoApp.state.tasks.find(t => t.id === "task-same").plannedTime') == '13:30'
        page.fill('#detail-due-time', '19:00')
        page.locator('#detail-due-time').dispatch_event('change')
        page.click('[data-action="close-modal"]')
        assert all(time in item('task-same').inner_text() for time in ['13:30', '19:00'])
        page.click('[data-action="calendar-view"][data-view="month"]')
        for label, first, last in [('October 2026', '2026-10-01', '2026-10-31'), ('November 2026', '2026-11-01', '2026-11-30'), ('December 2026', '2026-12-01', '2026-12-31'), ('January 2027', '2027-01-01', '2027-01-31'), ('February 2027', '2027-02-01', '2027-02-28')]:
            assert page.locator('.calendar-period').inner_text() == label
            dates = page.locator('.calendar-month [data-calendar-date]').evaluate_all('(els) => els.map(el => el.dataset.calendarDate)')
            assert dates[0] == first and dates[-1] == last
            if label != 'February 2027':
                page.click('[data-action="calendar-next"]')
        for _ in range(4):
            page.click('[data-action="calendar-prev"]')
        month_cell_text = cell('2026-10-29').inner_text().lower()
        assert '4 tasks' in month_cell_text
        assert '1 milestone' in month_cell_text
        assert '2 habits' in month_cell_text
        assert cell('2026-10-29').locator('[data-calendar-item-id]').count() == 0
        assert 'tasks' not in cell('2026-10-01').inner_text()
        page.screenshot(path=str(screenshots / 'month.png'), full_page=True)
        def detail(date):
            cell(date).click()
            page.wait_for_selector(f'.calendar-day-detail[data-detail-date="{date}"]')
            page.wait_for_function('document.activeElement?.dataset.action === "close-modal"')
            assert date in page.locator('.calendar-day-detail .modal-title').inner_text()
            return page.locator('.calendar-day-detail')
        d = detail('2026-10-29')
        assert page.locator('[data-action="close-modal"]').evaluate('(el) => el === document.activeElement')
        d.locator('[data-action="calendar-new-habit"]').focus()
        page.keyboard.press('Tab')
        assert page.locator('[data-action="close-modal"]').evaluate('(el) => el === document.activeElement')
        page.keyboard.press('Escape')
        page.wait_for_function('document.activeElement?.dataset.calendarDate === "2026-10-29"')
        d = detail('2026-10-29')
        assert item('task-same', d).count() == 1
        assert item('habit-numeric', d).count() == 1
        assert item('milestone-dated', d).count() == 1
        page.screenshot(path=str(screenshots / 'day-detail.png'), full_page=True, animations='disabled')
        item('task-same', d).locator('[data-action="toggle-complete"]').click()
        assert page.evaluate('TodoApp.state.tasks.find(t => t.id === "task-same").isCompleted')
        item('task-all-day', d).locator('[data-action="calendar-task-move"]').click()
        page.click('[data-pop-action="show-custom-date"]')
        page.fill('#custom-date-input', '2026-10-30')
        page.click('[data-pop-action="custom-date-apply"]')
        assert page.evaluate('TodoApp.state.tasks.find(t => t.id === "task-all-day").plannedDate') == '2026-10-30'
        item('task-same', d).locator('.calendar-quick-actions [data-action="open-task"]').click()
        assert page.locator('#detail-title').input_value() == 'Same day task'
        page.keyboard.press('Escape')
        d = detail('2026-10-28')
        item('habit-check', d).locator('[data-action="calendar-habit-checkin"]').click()
        page.wait_for_function('TodoApp.state.habitLogCache["habit-check"]?.some(log => log.date === "2026-10-28" && log.status === "done")')
        page.keyboard.press('Escape')
        page.wait_for_function('document.activeElement?.dataset.calendarDate === "2026-10-28"')
        d = detail('2026-10-29')
        item('habit-numeric', d).locator('[data-action="calendar-habit-add"]').click()
        page.wait_for_function('TodoApp.state.habitLogCache["habit-numeric"]?.[0].value === 0.5')
        assert '0.5 / 2' in item('habit-numeric', d).inner_text()
        item('habit-numeric', d).locator('[data-action="calendar-habit-edit"]').click()
        page.fill('#calendar-habit-value', '1.5')
        page.click('[data-action="calendar-save-habit-value"]')
        page.wait_for_function('TodoApp.state.habitLogCache["habit-numeric"]?.[0].value === 1.5')
        item('habit-numeric', d).locator('.calendar-quick-actions [data-route="habit/habit-numeric"]').click()
        page.wait_for_selector('.habit-detail-card')
        page.click('[data-route="calendar"]')
        d = detail('2026-10-30')
        item('goal-target', d).locator('[data-action="calendar-goal-progress"]').click()
        page.fill('#goal-current-value', '40')
        page.click('[data-action="save-goal-progress"]')
        assert page.evaluate('TodoApp.state.goals.find(g => g.id === "goal-target").currentValue') == 40
        page.keyboard.press('Escape')
        d = page.locator('.calendar-day-detail[data-detail-date="2026-10-30"]')
        item('goal-target', d).locator('.calendar-quick-actions [data-route="goal/goal-target"]').click()
        page.wait_for_function('document.querySelector(".page-title").textContent === "Target goal"')
        page.click('[data-route="calendar"]')
        d = detail('2026-10-29')
        item('milestone-dated', d).locator('[data-action="toggle-milestone"]').click()
        assert page.evaluate('TodoApp.state.goals.find(g => g.id === "goal-milestone").milestones[0].isCompleted')
        item('milestone-dated', d).locator('.calendar-quick-actions [data-route="goal/goal-milestone"]').click()
        page.wait_for_function('document.querySelector(".page-title").textContent === "Milestone parent"')
        page.click('[data-route="calendar"]')
        # Every creation uses the selected date, including dates beyond today.
        for kind, title, field, save in [('task', 'Calendar created task', '#quick-title', 'create-task'), ('goal', 'Calendar created goal', '#goal-title', 'save-goal'), ('habit', 'Calendar created habit', '#habit-name', 'save-habit')]:
            d = detail('2026-10-31')
            d.locator(f'[data-action="calendar-new-{kind}"]').click()
            page.fill(field, title)
            if kind == 'goal':
                assert page.locator('#goal-target-date').input_value() == '2026-10-31'
            if kind == 'habit':
                page.click('[data-action="toggle-habit-more"]')
                assert page.locator('#habit-start-date').input_value() == '2026-10-31'
            page.click(f'[data-action="{save}"]')
            collection, name_key, date_key = {'task': ('tasks', 'title', 'plannedDate'), 'goal': ('goals', 'title', 'targetDate'), 'habit': ('habits', 'name', 'startDate')}[kind]
            assert page.evaluate('([collection, key, title, dateKey]) => TodoApp.state[collection].find(x => x[key] === title)[dateKey]', [collection, name_key, title, date_key]) == '2026-10-31'
            if kind != 'task':
                page.click('[data-route="calendar"]')
        # Toggle every type in Month, Day Detail and Week; preserve on reload.
        for kind, fixture, date in [('tasks', 'task-same', '2026-10-29'), ('habits', 'habit-numeric', '2026-10-29'), ('goals', 'goal-target', '2026-10-30'), ('milestones', 'milestone-dated', '2026-10-29')]:
            page.locator(f'[data-calendar-visibility="{kind}"]').uncheck()
            assert kind.rstrip('s') not in cell(date).locator('.calendar-counts').inner_text()
            d = detail(date)
            assert item(fixture, d).count() == 0
            page.keyboard.press('Escape')
            page.click('[data-action="calendar-view"][data-view="week"]')
            assert item(fixture).count() == 0
            page.click('[data-action="calendar-view"][data-view="month"]')
            page.locator(f'[data-calendar-visibility="{kind}"]').check()
        page.locator('[data-calendar-visibility="milestones"]').uncheck()
        page.reload(wait_until='domcontentloaded')
        ready()
        assert not page.locator('[data-calendar-visibility="milestones"]').is_checked()
        assert page.evaluate('TodoApp.state.tasks.find(t => t.id === "task-same").plannedTime') == '13:30'
        assert page.evaluate('TodoApp.state.tasks.find(t => t.id === "task-same").dueTime') == '19:00'
        assert page.evaluate('TodoApp.state.tasks.find(t => t.id === "task-all-day").plannedTime') is None
        assert page.evaluate('async () => (await TodoStorage.habitLogs.listByHabit("habit-check"))[0].status') == 'done'
        assert page.evaluate('async () => (await TodoStorage.habitLogs.listByHabit("habit-numeric"))[0].value') == 1.5
        history = page.evaluate('async () => await TodoStorage.goalHistory.listByGoal("goal-target")')
        assert any(h['type'] == 'targetDateChanged' and h['data'] == {'from': '2026-10-29', 'to': '2026-10-30'} for h in history)
        assert any(h['type'] == 'progressChanged' and h['data']['to'] == 40 for h in history)
        d = detail('2026-10-29')
        item('habit-numeric', d).locator('[data-action="calendar-habit-edit"]').click()
        page.fill('#calendar-habit-value', '2')
        page.click('[data-action="calendar-save-habit-value"]')
        page.wait_for_function('TodoApp.state.habitLogCache["habit-numeric"]?.[0].value === 2')
        assert page.locator('.modal-title').inner_text() == 'Goal reached', page.evaluate('({progress:TodoCore.computeGoalProgress(TodoApp.state.goals.find(g => g.id === "goal-calendar-linked"),TodoApp.state,TodoApp.state.habitMetrics),metrics:TodoApp.state.habitMetrics["habit-numeric"],title:document.querySelector(".modal-title").textContent})')
        page.get_by_role('button', name='Keep active', exact=True).click()
        assert page.evaluate('TodoApp.state.goals.find(g => g.id === "goal-calendar-linked").status') == 'active'
        page.locator('[data-calendar-visibility="milestones"]').check()
        # February leap year and future scheduled Habit are shown but cannot check in.
        page.evaluate('TodoApp.state.ui.calendarDate = "2028-02-01"; TodoApp.render()')
        assert page.locator('.calendar-month [data-calendar-date]').count() == 29
        assert cell('2028-02-29').count() == 1
        d = detail('2028-02-03')
        future = item('habit-numeric', d)
        assert future.locator('[data-action="calendar-habit-add"]').is_disabled()
        assert future.locator('[data-action="calendar-habit-edit"]').is_disabled()
        assert page.evaluate('async () => await TodoApp.setHabitLog("habit-numeric", "2028-02-03", "done", 2)') is False
        page.keyboard.press('Escape')
        # Hold the first write before the real native store, accepting another
        # ordinary UI activation while the cache still contains zero.
        page.evaluate('TodoApp.state.ui.calendarDate = "2026-10-30"; TodoApp.render()')
        d = detail('2026-10-30')
        page.evaluate('''() => {
          const nativePut = TodoStorage.habitLogs.put.bind(TodoStorage.habitLogs);
          window.__burst = { calls: 0, committed: 0, held: false };
          const gate = new Promise(resolve => window.__burst.release = resolve);
          TodoStorage.habitLogs.put = async record => {
            if (record.habitId !== 'habit-burst') return nativePut(record);
            window.__burst.calls++;
            if (window.__burst.calls === 1) { window.__burst.held = true; await gate; }
            const result = await nativePut(record); window.__burst.committed++; return result;
          };
        }''')
        add = item('habit-burst', d).locator('[data-action="calendar-habit-add"]')
        add.click()
        page.wait_for_function('window.__burst.held')
        add.click()
        page.evaluate('window.__burst.release()')
        page.wait_for_function('window.__burst.committed === 2')
        total = page.evaluate('async () => (await TodoStorage.habitLogs.listByHabit("habit-burst"))[0].value')
        assert total == 1, f'two accepted +0.5 activations stored {total}, expected 1'
        page.keyboard.press('Escape')
        page.reload(wait_until='domcontentloaded')
        ready()
        assert page.evaluate('async () => (await TodoStorage.habitLogs.listByHabit("habit-burst"))[0].value') == 1
        # A rejected first operation must not poison the queued retry. Failed
        # writes do not increment; the next accepted click still increments.
        d = detail('2026-10-30')
        page.evaluate('''() => {
          const nativePut = TodoStorage.habitLogs.put.bind(TodoStorage.habitLogs);
          window.__retry = { calls: 0, committed: 0, held: false, failed: false };
          const gate = new Promise(resolve => window.__retry.release = resolve);
          TodoStorage.habitLogs.put = async record => {
            if (record.habitId !== 'habit-burst') return nativePut(record);
            window.__retry.calls++;
            if (window.__retry.calls === 1) { window.__retry.held = true; await gate; window.__retry.failed = true; throw new Error('Expected Calendar write failure'); }
            const result = await nativePut(record); window.__retry.committed++; return result;
          };
        }''')
        add = item('habit-burst', d).locator('[data-action="calendar-habit-add"]')
        add.click()
        page.wait_for_function('window.__retry.held')
        add.click()
        page.evaluate('window.__retry.release()')
        page.wait_for_function('window.__retry.failed && window.__retry.committed === 1')
        page.wait_for_function('TodoApp.state.habitLogCache["habit-burst"]?.[0].value === 1.5')
        page.keyboard.press('Escape')
        page.reload(wait_until='domcontentloaded')
        ready()
        assert page.evaluate('async () => (await TodoStorage.habitLogs.listByHabit("habit-burst"))[0].value') == 1.5
        # Crossing a decision boundary while accepted adds remain queued must
        # keep the existing decision overlay, not reopen Day Detail over it.
        def decision_burst(habit_id, date, heading):
            d = detail(date)
            page.evaluate('''id => {
              const nativePut = TodoStorage.habitLogs.put.bind(TodoStorage.habitLogs);
              window.__decisionBurst = { calls: 0, committed: 0, held: false, restore: () => { TodoStorage.habitLogs.put = nativePut; } };
              const gate = new Promise(resolve => window.__decisionBurst.release = resolve);
              TodoStorage.habitLogs.put = async record => {
                if (record.habitId !== id) return nativePut(record);
                window.__decisionBurst.calls++;
                if (window.__decisionBurst.calls === 1) { window.__decisionBurst.held = true; await gate; }
                const result = await nativePut(record); window.__decisionBurst.committed++; return result;
              };
            }''', habit_id)
            add = item(habit_id, d).locator('[data-action="calendar-habit-add"]')
            add.click()
            page.wait_for_function('window.__decisionBurst.held')
            add.click()
            page.evaluate('window.__decisionBurst.release()')
            page.wait_for_function('window.__decisionBurst.committed === 2')
            page.wait_for_function('id => TodoApp.state.habitLogCache[id]?.[0].value === 2.5', arg=habit_id)
            assert page.locator('.modal-title').inner_text() == heading
            assert page.evaluate('async id => (await TodoStorage.habitLogs.listByHabit(id))[0].value', habit_id) == 2.5
            page.evaluate('window.__decisionBurst.restore()')
        d = detail('2026-10-29')
        item('habit-numeric', d).locator('[data-action="calendar-habit-edit"]').click()
        page.fill('#calendar-habit-value', '1.5')
        page.click('[data-action="calendar-save-habit-value"]')
        page.wait_for_function('TodoApp.state.habitLogCache["habit-numeric"]?.[0].value === 1.5')
        page.keyboard.press('Escape')
        decision_burst('habit-numeric', '2026-10-29', 'Goal reached')
        page.get_by_role('button', name='Keep active', exact=True).click()
        decision_burst('habit-burst', '2026-10-30', 'Habit finished')
        page.click('[data-action="continue-habit"]')
        page.reload(wait_until='domcontentloaded')
        ready()
        for habit_id in ['habit-numeric', 'habit-burst']:
            assert page.evaluate('async id => (await TodoStorage.habitLogs.listByHabit(id))[0].value', habit_id) == 2.5
        # Native prior-week logs survive the same date-boundary refresh and reload.
        page.evaluate('''async () => { await TodoApp.setHabitLog('weekly-native','2026-10-27','done'); await TodoApp.setHabitLog('weekly-native','2026-10-28','done'); window.__TODO_TEST_SET_NOW__('2026-11-02T12:00:00'); await TodoApp.refreshHabitDateBoundary(); }''')
        assert page.evaluate('TodoApp.state.habitMetrics["weekly-native"].currentPeriodCount') == 0
        assert page.evaluate('async () => (await TodoStorage.habitLogs.listByHabit("weekly-native")).length') == 2
        page.reload(wait_until='domcontentloaded')
        ready()
        page.evaluate("async () => { window.__TODO_TEST_SET_NOW__('2026-11-02T12:00:00'); await TodoApp.refreshHabitDateBoundary(); }")
        assert page.evaluate('TodoApp.state.habitMetrics["weekly-native"].currentPeriodCount') == 0
        assert page.evaluate('async () => (await TodoStorage.habitLogs.listByHabit("weekly-native")).length') == 2
        assert errors == [], errors
        print('PASS: 18 Calendar acceptance scenarios, independent time editor, future Habit guard, native Habit/Goal history reload, native weekly history retained')
        print('PASS: native quick-add burst accumulates, failure releases queued retry, Goal/Habit decisions preserved, resulting totals survive reload')
    finally:
        try:
            if context:
                context.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


def main():
    executable = chromium_path()
    with sync_playwright() as p:
        # Falling back to Playwright's bundled Chromium remains isolated; never use Google Chrome.
        launch_args = {'headless': True, 'args': ['--no-sandbox']}
        if executable:
            launch_args['executable_path'] = executable
        browser = p.chromium.launch(**launch_args)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        try:
            native_calendar(browser)
            planning = context.new_page()
            planning_seed = seed_state()
            planning_seed['tasks'] = [
                {'id': 'late-task', 'title': 'Late task', 'dueDate': '2026-09-15'},
                {'id': 'today-task', 'title': 'Planned task', 'plannedDate': '2026-09-16'},
                {'id': 'future-task', 'title': 'Future task', 'plannedDate': '2026-09-18'},
                {'id': 'suggest-task', 'title': 'Suggested deadline', 'dueDate': '2026-09-16'},
                {'id': 'done-task', 'title': 'Completed task', 'isCompleted': True, 'completedAt': '2026-09-16T10:00:00'},
            ]
            planning_seed['goals'] = [
                {'id': 'late-goal', 'title': 'Late goal', 'status': 'active', 'targetDate': '2026-09-15'},
                {'id': 'today-goal', 'title': 'Today goal', 'status': 'active', 'targetDate': '2026-09-16', 'progressMode': 'linkedHabits', 'habitLinks': [{'habitId': 'daily', 'metric': 'totalCheckins', 'target': 2}], 'milestones': [{'id': 'late-milestone', 'title': 'Late milestone', 'date': '2026-09-15', 'isCompleted': False}]},
                {'id': 'future-goal', 'title': 'Future goal', 'status': 'active', 'targetDate': '2026-09-18'},
                {'id': 'goal-only', 'title': 'Goal only date', 'status': 'active', 'targetDate': '2026-09-17'},
                {'id': 'paused-goal', 'title': 'Hidden paused goal', 'status': 'paused', 'targetDate': '2026-09-18'},
                {'id': 'completed-goal', 'title': 'Hidden completed goal', 'status': 'completed', 'targetDate': '2026-09-18'},
                {'id': 'archived-goal', 'title': 'Hidden archived goal', 'status': 'archived', 'targetDate': '2026-09-18'},
            ]
            planning_seed['habits'] = [
                {'id': 'daily', 'name': 'Daily planning habit', 'status': 'active', 'frequencyType': 'daily', 'trackingType': 'checkbox', 'startDate': '2026-09-16'},
                {'id': 'weekly', 'name': 'Weekly planning habit', 'status': 'active', 'frequencyType': 'timesPerWeek', 'timesPerWeek': 2, 'trackingType': 'checkbox', 'startDate': '2026-09-14'},
                {'id': 'numeric', 'name': 'Numeric planning habit', 'status': 'active', 'frequencyType': 'daily', 'trackingType': 'numeric', 'targetValue': 2, 'quickValues': [0.5, 1], 'startDate': '2026-09-16'},
                {'id': 'offday', 'name': 'Hidden offday habit', 'status': 'active', 'frequencyType': 'weekdays', 'weekdays': [4], 'startDate': '2026-09-01'},
            ]
            boot(planning, now='2026-09-16T12:00:00', seed=planning_seed)
            labels = planning.locator('#main .section-label').all_text_contents()
            assert labels == ['Daily actions', 'Overdue Tasks', 'Tasks', 'Habits', 'Overdue Milestones', 'Overdue Goals', 'Goals'], labels
            assert planning.locator('#main [data-action="toggle-today-completed"]').count() == 1
            assert planning.locator('#main').inner_text().index('Goals') < planning.locator('#main').inner_text().rindex('Completed')
            suggestion_section = planning.locator('[data-action="toggle-suggestions"]').locator('xpath=ancestor::section[1]')
            assert suggestion_section.locator('.section-label').inner_text() == 'Tasks'
            planning.click('[data-action="toggle-suggestions"]')
            assert 'Suggested deadline' in suggestion_section.inner_text()
            assert 'due today' in suggestion_section.inner_text().lower()
            planning.click('[data-action="add-all-suggestions"]')
            assert planning.evaluate("TodoApp.state.tasks.find(task => task.id === 'suggest-task').plannedDate") == '2026-09-16'
            assert planning.locator('#main [data-route="habit/offday"]').count() == 0
            planning.click('#main [data-action="habit-checkin"][data-habit-id="daily"]')
            planning.wait_for_function("TodoApp.state.habitMetrics.daily.totalCheckins === 1")
            assert '50%' in planning.locator('#main .goal-row[data-goal-id="today-goal"]').inner_text()
            planning.click('#main [data-action="habit-quick-add"][data-habit-id="numeric"][data-value="0.5"]')
            planning.wait_for_function("TodoApp.state.habitMetrics.numeric.currentPeriodCount === 0.5")
            assert '0.5 / 2' in planning.locator('#main .habit-open[data-route="habit/numeric"]').inner_text()
            planning.evaluate("async () => { await TodoApp.setHabitLog('weekly', '2026-09-14', 'done'); await TodoApp.setHabitLog('weekly', '2026-09-15', 'done'); }")
            assert '2 / 2 this week' in planning.locator('#main [data-route="habit/weekly"]').inner_text()
            planning.click('#main [data-action="habit-checkin"][data-habit-id="weekly"]')
            planning.wait_for_function("TodoApp.state.habitMetrics.weekly.currentPeriodCount === 3")
            assert '3 / 2 this week' in planning.locator('#main [data-route="habit/weekly"]').inner_text()
            planning.click('#main [data-action="habit-skip"][data-habit-id="daily"]')
            planning.wait_for_function("TodoApp.state.habitLogCache.daily[0].status === 'skipped'")
            assert 'skipped' in planning.locator('#main [data-route="habit/daily"]').inner_text()
            assert '0%' in planning.locator('#main .goal-row[data-goal-id="today-goal"]').inner_text()
            planning.click('#main [data-action="toggle-milestone"]')
            assert planning.locator('#main .section-label').all_text_contents() == ['Daily actions', 'Overdue Tasks', 'Tasks', 'Habits', 'Overdue Goals', 'Goals']
            stored = planning.evaluate("JSON.parse(localStorage.getItem('todoAppData'))")
            assert not any(key in stored for key in ['habitLogCache', 'habitMetrics', 'habitLogs'])
            planning.click('[data-route="upcoming"]')
            planning.wait_for_function("document.querySelector('.page-title').textContent === 'Upcoming'")
            assert planning.locator('#main .goal-row').count() == 2
            assert 'Future task' in planning.locator('#main').inner_text()
            assert 'Hidden paused goal' not in planning.locator('#main').inner_text()
            assert 'Hidden completed goal' not in planning.locator('#main').inner_text()
            assert 'Hidden archived goal' not in planning.locator('#main').inner_text()
            assert planning.locator('#main .habit-row').count() >= 1
            planning.evaluate("TodoApp.state.tasks = []; TodoApp.state.goals = []; location.hash = '#today'; TodoApp.render()")
            planning.wait_for_function("location.hash === '#today' && document.querySelector('.page-title').textContent === 'Today'")
            assert planning.locator('#main .section-label').all_text_contents() == ['Daily actions', 'Habits']
            # Correcting a historical required miss refreshes the displayed
            # streak on the detail surface as well as hydrated metrics.
            planning.evaluate("async () => { TodoApp.state.habits.push({id:'streak', name:'Streak correction', status:'active', frequencyType:'daily', trackingType:'checkbox', startDate:'2026-09-14'}); await TodoApp.setHabitLog('streak','2026-09-14','done'); await TodoApp.setHabitLog('streak','2026-09-16','done'); location.hash = '#habit/streak'; }")
            planning.wait_for_selector('.habit-metric-grid')
            assert planning.locator('.habit-metric-grid > div').nth(0).locator('strong').inner_text() == '1'
            planning.fill('#habit-history-date', '2026-09-15')
            planning.select_option('#habit-history-new-status', 'done')
            planning.click('[data-action="save-habit-history-date"]')
            planning.wait_for_function("TodoApp.state.habitMetrics.streak.currentStreak === 3")
            assert planning.locator('.habit-metric-grid > div').nth(0).locator('strong').inner_text() == '3'
            planning.close()

            page = context.new_page()
            boot(page)

            # Checkbox habit CRUD, Today-compatible X/week count, lifecycle, and delete/Undo.
            page.click('[data-route="habits"]')
            page.click('[data-action="new-habit"]')
            page.fill('#habit-name', 'Gym')
            page.select_option('#habit-frequency', 'timesPerWeek')
            page.fill('#habit-times-per-week', '4')
            page.click('[data-action="toggle-habit-more"]')
            page.fill('#habit-start-date', page.evaluate("TodoCore.addDays(TodoCore.dateOnly(), -2)"))
            page.click('[data-action="save-habit"]')
            habit_id = page.evaluate("TodoApp.state.habits.find(h => h.name === 'Gym').id")
            page.click('[data-action="habit-checkin"]')
            for offset in [1, 2]:
                page.evaluate("async ([id, n]) => await TodoApp.setHabitLog(id, TodoCore.addDays(TodoCore.dateOnly(), -n), 'done')", [habit_id, offset])
            page.wait_for_timeout(20)
            detail_text = page.locator('.habit-detail-card').inner_text()
            assert '3 / 4' in detail_text, detail_text
            page.click('[data-action="habit-menu"]')
            page.click('[data-pop-action="pause-habit"]')
            assert page.evaluate("id => TodoApp.state.habits.find(h => h.id === id).status", habit_id) == 'paused'
            page.click('[data-action="habit-menu"]')
            page.click('[data-pop-action="archive-habit"]')
            page.click('[data-route="habits"]')
            page.click('[data-habit-tab="archived"]')
            page.click('[data-action="habit-menu"]')
            page.click('[data-pop-action="restore-habit"]')
            page.click('[data-route="habits"]')
            page.click('[data-habit-tab="active"]')
            page.click('[data-action="habit-menu"]')
            page.click('[data-pop-action="delete-habit"]')
            assert page.locator('.modal-title').inner_text().startswith('Delete')
            page.click('[data-action="confirm-action"]')
            assert page.evaluate("id => TodoApp.state.habits.some(h => h.id === id)", habit_id) is False
            page.click('[data-action="undo"]')
            assert page.evaluate("id => TodoApp.state.habits.some(h => h.id === id)", habit_id) is True

            # Numeric quick add, direct total edit, history correction and heatmap surface.
            page.click('[data-action="new-habit"]')
            page.fill('#habit-name', 'Water')
            page.select_option('#habit-tracking', 'numeric')
            page.fill('#habit-target-value', '2')
            page.click('[data-action="toggle-habit-more"]')
            page.fill('#habit-quick-values', '0.5,1')
            page.click('[data-action="save-habit"]')
            page.wait_for_function("TodoApp.state.habits.some(h => h.name === 'Water') && document.querySelector('.habit-detail-card')")
            numeric_id = page.evaluate("TodoApp.state.habits.find(h => h.name === 'Water').id")
            page.click('[data-action="habit-quick-add"][data-value="0.5"]')
            page.wait_for_timeout(20)
            page.click('[data-action="habit-quick-add"][data-value="0.5"]')
            page.wait_for_timeout(20)
            page.fill('#habit-direct-total', '2.4')
            page.click('[data-action="save-habit-total"]')
            assert '2.4 / 2' in page.locator('.habit-detail-card').inner_text()
            assert page.locator('.habit-heatmap').count() == 1
            page.fill('[data-habit-history-value]', '1')
            page.click('[data-action="save-habit-history"]')
            assert page.evaluate("async id => (await TodoStorage.habitLogs.listByHabit(id))[0].value", numeric_id) == 1
            page.click('[data-action="edit-habit"]')
            page.fill('#habit-name', 'Water edited')
            page.click('[data-action="save-habit"]')
            assert page.evaluate("id => TodoApp.state.habits.find(h => h.id === id).quickValues", numeric_id) == [0.5, 1]
            persisted_state = page.evaluate('TodoApp.state')
            reloaded = context.new_page()
            boot(reloaded, seed=persisted_state)
            reloaded.evaluate(f"location.hash = '#habit/{numeric_id}'")
            reloaded.wait_for_selector('[data-action="habit-quick-add"][data-value="0.5"]')
            reloaded.click('[data-action="habit-quick-add"][data-value="0.5"]')
            reloaded.wait_for_timeout(20)
            assert reloaded.locator('[data-action="habit-quick-add"][data-value="1"]').count() == 1
            reloaded.close()

            # The Habit More section owns its direct Goal links and updates both sides.
            page.click('[data-route="goals"]')
            page.click('[data-action="new-goal"]')
            page.fill('#goal-title', 'Read more')
            page.click('[data-action="save-goal"]')
            goal_id = page.evaluate("TodoApp.state.goals.find(g => g.title === 'Read more').id")
            page.click('[data-route="habits"]')
            page.click('[data-action="new-habit"]')
            page.fill('#habit-name', 'Reading')
            page.click('[data-action="toggle-habit-more"]')
            goal_link = page.locator(f'[data-habit-goal="{goal_id}"]')
            assert goal_link.count() == 1, page.locator('#modal-root').inner_text()
            goal_link.check()
            page.click('[data-action="save-habit"]')
            linked_id = page.evaluate("TodoApp.state.habits.find(h => h.name === 'Reading').id")
            assert goal_id in page.evaluate("id => TodoApp.state.habits.find(h => h.id === id).goalIds", linked_id)
            assert linked_id in page.evaluate("id => TodoApp.state.goals.find(g => g.id === id).habitLinks.map(link => link.habitId)", goal_id)

            # Fixed wall clock makes month length, weekly target and reminder
            # assertions repeatable: October has all 31 heatmap days.
            assert page.evaluate('TodoCore.dateOnly()') == '2026-10-31'
            page.evaluate(f"location.hash = '#habit/{numeric_id}'")
            page.wait_for_selector('.habit-detail-card')
            assert page.locator('.habit-heatmap .heatmap-day').count() == 31

            # A numeric X/week habit labels the weekly count (5 / 4), not its
            # per-check-in numeric amount (2 L).
            page.click('[data-route="habits"]')
            page.click('[data-action="new-habit"]')
            page.fill('#habit-name', 'Protein')
            page.select_option('#habit-tracking', 'numeric')
            page.select_option('#habit-frequency', 'timesPerWeek')
            page.fill('#habit-target-value', '2')
            page.fill('#habit-times-per-week', '4')
            page.click('[data-action="toggle-habit-more"]')
            page.fill('#habit-start-date', '2026-10-27')
            page.click('[data-action="save-habit"]')
            page.wait_for_function("TodoApp.state.habits.some(h => h.name === 'Protein') && document.querySelector('.habit-detail-card')")
            protein_id = page.evaluate("TodoApp.state.habits.find(h => h.name === 'Protein').id")
            writes = [page.evaluate("async ([id, n]) => await TodoApp.setHabitLog(id, TodoCore.addDays(TodoCore.dateOnly(), -n), 'done', 2)", [protein_id, offset]) for offset in range(5)]
            assert writes == [True] * 5, writes
            page.wait_for_timeout(20)
            assert '5 / 4 this week' in page.locator('.habit-detail-card').inner_text()

            # Collapsing More is lossless: hidden reminder object identity,
            # enabled flag and goal link survive a routine edit.
            page.click('[data-action="edit-habit"]')
            page.click('[data-action="toggle-habit-more"]')
            page.fill('#habit-reminders', '18:00')
            page.locator(f'[data-habit-goal="{goal_id}"]').check()
            page.click('[data-action="toggle-habit-more"]')
            page.fill('#habit-name', 'Protein edited')
            page.click('[data-action="save-habit"]')
            persisted = page.evaluate("id => TodoApp.state.habits.find(h => h.id === id)", protein_id)
            assert persisted['reminders'][0]['time'] == '18:00' and persisted['reminders'][0]['enabled'] is True
            assert goal_id in persisted['goalIds']

            # More only renders enabled times, but an unrelated edit must keep
            # disabled records byte-for-byte identifiable.
            page.evaluate("id => { const habit = TodoApp.state.habits.find(h => h.id === id); habit.reminders.push({ id: 'disabled-reminder', time: '19:00', enabled: false }); TodoApp.render(); }", protein_id)
            page.click('[data-action="edit-habit"]')
            page.click('[data-action="toggle-habit-more"]')
            page.fill('#habit-name', 'Protein with disabled reminder')
            page.click('[data-action="save-habit"]')
            assert page.evaluate("id => TodoApp.state.habits.find(h => h.id === id).reminders.find(r => r.id === 'disabled-reminder')", protein_id) == {'id': 'disabled-reminder', 'time': '19:00', 'enabled': False}

            # Historical corrections remain available after pause/archive and
            # the exact date editor can create an older, previously missing log.
            page.click('[data-action="habit-menu"]')
            page.click('[data-pop-action="pause-habit"]')
            assert page.evaluate("id => TodoApp.state.habits.find(h => h.id === id).pauseStartedAt", protein_id) == '2026-10-31'
            page.evaluate("window.__TODO_TEST_SET_NOW__('2026-11-01T10:00:00')")
            old_date = '2026-10-31'
            assert page.evaluate("async ([id, date]) => await TodoApp.setHabitLog(id, date, 'done', 2)", [protein_id, old_date]) is True
            page.click('[data-action="habit-menu"]')
            page.click('[data-pop-action="archive-habit"]')
            assert page.evaluate("id => TodoApp.state.habits.find(h => h.id === id).pauseStartedAt", protein_id) == '2026-10-31'
            assert page.evaluate("async ([id, date]) => await TodoApp.setHabitLog(id, date, 'done', 2)", [protein_id, old_date]) is True

            # Original reminder fires once; a snooze creates a distinct pending
            # delivery after the original moment has already been recorded.
            page.evaluate("window.__TODO_TEST_SET_NOW__('2026-10-31T20:00:00')")
            page.evaluate('''async () => {
              TodoApp.state.habits.push({ id: 'snooze-check', name: 'Snooze check', status: 'active', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-10-01', weekdays: [], timesPerWeek: 1, everyNDays: 1, targetValue: 1, reminders: [{ id: 'r1', time: '20:00', enabled: true }], reminderFiredMoments: [], pauseIntervals: [] });
              await TodoApp.refreshHabitMetrics(); TodoApp.render(); TodoApp.checkReminders();
            }''')
            assert page.evaluate("TodoApp.state.habits.find(h => h.id === 'snooze-check').reminderFiredMoments.length") == 1
            page.evaluate("TodoApp.snoozeHabit('snooze-check', '15m')")
            page.evaluate("window.__TODO_TEST_SET_NOW__('2026-10-31T20:15:00')")
            page.evaluate('TodoApp.checkReminders()')
            snoozed = page.evaluate("TodoApp.state.habits.find(h => h.id === 'snooze-check')")
            assert any(moment.startswith('snooze:') for moment in snoozed['reminderFiredMoments'])

            # Closed-period continuation prompts on boundary and Continue
            # records that boundary so it does not prompt repeatedly.
            page.evaluate('''async () => {
              TodoApp.state.habits.push({ id: 'continuation-check', name: 'Continuation check', status: 'active', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-10-01', continuation: 'askEachPeriod', endType: 'never', reminders: [], pauseIntervals: [] });
              await TodoStorage.habitLogs.put({ id: 'continuation-check:2026-10-30', habitId: 'continuation-check', date: '2026-10-30', status: 'done', value: null });
              await TodoApp.refreshHabitMetrics(); await TodoApp.evaluateHabitBoundaries();
            }''')
            assert page.locator('.modal-title').inner_text() == 'Continue habit?'
            page.click('[data-action="continue-habit"]')
            assert page.evaluate("TodoApp.state.habits.find(h => h.id === 'continuation-check').lastContinuationPeriod") == '2026-10-30'

            # Expired date ends prompt at startup/boundary without a new
            # check-in; Continue clears the reached condition. One-period
            # conversion then switches its lifecycle to automatic repetition.
            page.evaluate('''async () => {
              TodoApp.state.habits.push({ id: 'date-end-check', name: 'Date end check', status: 'active', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-10-01', continuation: 'automatic', endType: 'date', endDate: '2026-10-30', reminders: [], pauseIntervals: [] });
              await TodoApp.refreshHabitMetrics(); await TodoApp.evaluateHabitBoundaries();
            }''')
            assert page.locator('.modal-title').inner_text() == 'Habit finished'
            page.click('[data-action="continue-habit"]')
            assert page.evaluate("TodoApp.state.habits.find(h => h.id === 'date-end-check').endType") == 'never'
            page.evaluate('''async () => {
              TodoApp.state.habits.push({ id: 'one-period-check', name: 'One period check', status: 'active', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-10-30', continuation: 'onePeriod', endType: 'never', reminders: [], pauseIntervals: [] });
              await TodoStorage.habitLogs.put({ id: 'one-period-check:2026-10-30', habitId: 'one-period-check', date: '2026-10-30', status: 'done', value: null });
              await TodoApp.refreshHabitMetrics(); await TodoApp.evaluateHabitBoundaries();
            }''')
            assert page.locator('.modal-title').inner_text() == 'Habit period finished'
            page.click('[data-action="continue-habit"]')
            assert page.evaluate("TodoApp.state.habits.find(h => h.id === 'one-period-check').continuation") == 'automatic'

            # Startup evaluates missed closed periods too. Pause is a normal
            # modal action, closes the decision, and changes lifecycle state.
            ask_seed = seed_state()
            ask_seed['habits'] = [{ 'id': 'missed-ask', 'name': 'Missed ask', 'status': 'active', 'trackingType': 'checkbox', 'frequencyType': 'daily', 'startDate': '2026-10-30', 'continuation': 'askEachPeriod', 'endType': 'never', 'reminders': [], 'pauseIntervals': [] }]
            startup = context.new_page()
            boot(startup, seed=ask_seed)
            startup.wait_for_selector('.modal-title')
            assert startup.locator('.modal-title').inner_text() == 'Continue habit?'
            startup.click('[data-action="pause-habit"]')
            assert startup.evaluate("TodoApp.state.habits.find(h => h.id === 'missed-ask').status") == 'paused'
            assert startup.locator('.modal-title').count() == 0
            startup.close()

            one_seed = seed_state()
            one_seed['habits'] = [{ 'id': 'missed-one', 'name': 'Missed one', 'status': 'active', 'trackingType': 'checkbox', 'frequencyType': 'daily', 'startDate': '2026-10-30', 'continuation': 'onePeriod', 'endType': 'never', 'reminders': [], 'pauseIntervals': [] }]
            startup = context.new_page()
            boot(startup, seed=one_seed)
            startup.wait_for_selector('.modal-title')
            assert startup.locator('.modal-title').inner_text() == 'Habit period finished'
            startup.close()

            # The same routine used by the open-app date timer clears a
            # completed weekly target before next-week render/reminders.
            page.evaluate('''async () => {
              TodoApp.state.habits.push({ id: 'weekly-reset', name: 'Weekly reset', status: 'active', trackingType: 'checkbox', frequencyType: 'timesPerWeek', timesPerWeek: 4, startDate: '2026-10-27', reminders: [{ id: 'weekly-reminder', time: '20:00', enabled: true }], reminderFiredMoments: [], pauseIntervals: [] });
              for (const date of ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) await TodoStorage.habitLogs.put({ id: `weekly-reset:${date}`, habitId: 'weekly-reset', date, status: 'done', value: null });
              await TodoApp.refreshHabitMetrics(); TodoApp.checkReminders();
            }''')
            assert page.evaluate("TodoApp.state.habitMetrics['weekly-reset'].currentPeriodCount") == 4
            page.evaluate("location.hash = '#habit/weekly-reset'; TodoApp.render()")
            page.wait_for_function("document.querySelector('.page-title').textContent === 'Weekly reset'")
            assert '4 / 4 this week' in page.locator('.habit-detail-card').inner_text()
            assert page.evaluate("TodoApp.state.habits.find(h => h.id === 'weekly-reset').reminderFiredMoments") == []
            page.evaluate("window.__TODO_TEST_SET_NOW__('2026-11-02T20:00:00')")
            page.evaluate('TodoApp.refreshHabitDateBoundary()')
            page.wait_for_timeout(40)
            assert page.evaluate("TodoApp.state.habitMetrics['weekly-reset'].currentPeriodCount") == 0
            assert page.evaluate("TodoApp.state.habitMetrics['weekly-reset'].currentPeriodTarget") == 4
            assert page.evaluate("async () => (await TodoStorage.habitLogs.listByHabit('weekly-reset')).length") == 4
            assert '0 / 4 this week' in page.locator('.habit-detail-card').inner_text()
            page.click('[data-route="today"]')
            page.wait_for_function("document.querySelector('.page-title').textContent === 'Today'")
            assert '0 / 4 this week' in page.locator('#main [data-route="habit/weekly-reset"]').inner_text()
            print('PASS: Today/Upcoming integration, rendered historical streak correction, rendered weekly reset, and existing Habit UI regressions')
        finally:
            context.close()
            browser.close()


if __name__ == '__main__':
    main()
