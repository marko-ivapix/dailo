from pathlib import Path
import shutil

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = [(ROOT / path).read_text() for path in [
    'vendor/jszip.min.js', 'js/core.js', 'js/storage.js', 'js/attachments.js', 'js/backup.js', 'js/app.js',
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


def main():
    executable = chromium_path()
    with sync_playwright() as p:
        # Falling back to Playwright's bundled Chromium remains isolated; never use Google Chrome.
        launch_args = {'headless': True, 'args': ['--no-sandbox']}
        if executable:
            launch_args['executable_path'] = executable
        browser = p.chromium.launch(**launch_args)
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
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
            reloaded = browser.new_page(viewport={'width': 1440, 'height': 1000})
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
            startup = browser.new_page(viewport={'width': 1440, 'height': 1000})
            boot(startup, seed=ask_seed)
            startup.wait_for_selector('.modal-title')
            assert startup.locator('.modal-title').inner_text() == 'Continue habit?'
            startup.click('[data-action="pause-habit"]')
            assert startup.evaluate("TodoApp.state.habits.find(h => h.id === 'missed-ask').status") == 'paused'
            assert startup.locator('.modal-title').count() == 0
            startup.close()

            one_seed = seed_state()
            one_seed['habits'] = [{ 'id': 'missed-one', 'name': 'Missed one', 'status': 'active', 'trackingType': 'checkbox', 'frequencyType': 'daily', 'startDate': '2026-10-30', 'continuation': 'onePeriod', 'endType': 'never', 'reminders': [], 'pauseIntervals': [] }]
            startup = browser.new_page(viewport={'width': 1440, 'height': 1000})
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
            assert page.evaluate("TodoApp.state.habits.find(h => h.id === 'weekly-reset').reminderFiredMoments") == []
            page.evaluate("window.__TODO_TEST_SET_NOW__('2026-11-02T20:00:00')")
            page.evaluate('TodoApp.refreshHabitDateBoundary()')
            page.wait_for_timeout(40)
            assert page.evaluate("TodoApp.state.habitMetrics['weekly-reset'].currentPeriodCount") == 0
            assert page.evaluate("TodoApp.state.habitMetrics['weekly-reset'].currentPeriodTarget") == 4
        finally:
            browser.close()


if __name__ == '__main__':
    main()
