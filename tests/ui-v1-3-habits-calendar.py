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


def boot(page):
    page.set_content(SHELL)
    page.evaluate('''seed => {
      window.__TODO_TEST_MEMORY_DB__ = true;
      const data = new Map([['todoAppData', JSON.stringify(seed)]]);
      Object.defineProperty(window, 'localStorage', { value: {
        getItem: key => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), clear: () => data.clear(),
      }, configurable: true });
      location.hash = '#today';
    }''', seed_state())
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
        finally:
            browser.close()


if __name__ == '__main__':
    main()
