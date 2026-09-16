from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CORE = (ROOT / 'js' / 'core.js').read_text()
APP = (ROOT / 'js' / 'app.js').read_text()
SHELL = '''<!doctype html><html><body>
<div id="app" class="app-shell" aria-live="polite">
  <aside id="sidebar" class="sidebar" aria-label="Primary navigation"></aside>
  <main id="main" class="main" tabindex="-1"></main>
</div>
<div id="modal-root"></div>
<div id="toast-root" class="toast-root" aria-live="assertive" aria-atomic="true"></div>
</body></html>'''


def boot(page):
    page.set_content(SHELL)
    page.evaluate("location.hash = '#today'")
    page.evaluate('''() => {
      const data = new Map();
      Object.defineProperty(window, 'localStorage', { value: {
        getItem: key => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key),
        clear: () => data.clear()
      }, configurable: true });
    }''')
    page.add_script_tag(content=CORE)
    page.add_script_tag(content=APP)
    page.wait_for_selector('.page-title')


def assert_text(page, selector, text):
    locator = page.locator(selector)
    assert locator.count() > 0, f"Missing selector: {selector}"
    assert text in locator.first.inner_text(), f"Expected {text!r} in {selector}: {locator.first.inner_text()!r}"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        boot(page)

        # More exposes Anytime / Archived and Anytime is a real processed-task view.
        page.click('[data-action="more-menu"]')
        assert page.locator('[data-route="anytime"]').count() == 1, 'Anytime route missing from More'
        assert page.locator('[data-route="archived"]').count() == 1, 'Archived Projects route missing from More'
        page.click('[data-route="anytime"]')
        page.wait_for_timeout(50)
        assert_text(page, '.page-title', 'Anytime')

        page.locator('.page-actions [data-action="quick-add"]').click()
        page.fill('#quick-title', 'Loose v1.1 task')
        page.click('[data-action="create-task"]')
        created = page.evaluate("window.TodoApp.state.tasks.find(t => t.title === 'Loose v1.1 task')")
        assert created and created['isInbox'] is False and created['plannedDate'] is None
        assert page.locator('.task-title', has_text='Loose v1.1 task').count() == 1

        # Task detail exposes and persists Reminder + Repeat.
        page.locator('[data-action="open-task"]', has_text='Loose v1.1 task').click()
        assert_text(page, '[data-action="task-reminder-picker"] .property-key', 'Reminder')
        assert_text(page, '[data-action="task-repeat-picker"] .property-key', 'Repeat')
        task_id = page.evaluate("window.TodoApp.state.tasks.find(t => t.title === 'Loose v1.1 task').id")

        page.click('[data-action="task-reminder-picker"]')
        page.locator('[data-pop-action="set-reminder"]').first.click()
        assert page.evaluate(f"Boolean(window.TodoApp.state.tasks.find(t => t.id === '{task_id}').reminderAt)")

        page.click('[data-action="task-repeat-picker"]')
        page.click('[data-pop-action="set-repeat"][data-frequency="weekly"]')
        repeat = page.evaluate(f"window.TodoApp.state.tasks.find(t => t.id === '{task_id}').recurrence")
        assert repeat == {'frequency': 'weekly', 'interval': 1}
        page.click('[data-action="close-modal"]')

        # Completing recurring task creates the next active occurrence.
        page.locator(f'[data-action="toggle-complete"][data-task-id="{task_id}"]').click()
        occurrences = page.evaluate("window.TodoApp.state.tasks.filter(t => t.title === 'Loose v1.1 task').map(t => ({done:t.isCompleted, planned:t.plannedDate}))")
        assert len(occurrences) == 2 and sum(1 for item in occurrences if item['done']) == 1
        assert sum(1 for item in occurrences if not item['done']) == 1

        # Direct Move to Tomorrow updates planned date.
        page.evaluate("location.hash = '#today'")
        page.wait_for_timeout(50)
        today_task_id = 'task_homepage'
        page.click(f'[data-action="task-menu"][data-task-id="{today_task_id}"]')
        assert page.locator('[data-pop-action="task-move-tomorrow"]').count() == 1, 'Move to Tomorrow missing'
        page.click('[data-pop-action="task-move-tomorrow"]')
        moved = page.evaluate("window.TodoApp.state.tasks.find(t => t.id === 'task_homepage').plannedDate")
        today = page.evaluate("window.TodoCore.dateOnly()")
        tomorrow = page.evaluate("window.TodoCore.addDays(window.TodoCore.dateOnly(), 1)")
        assert moved == tomorrow and moved != today

        # Project archive removes it from active sidebar and Archived view can restore it.
        page.evaluate("location.hash = '#project/project_client'")
        page.wait_for_timeout(50)
        assert_text(page, '.page-title', 'Client Website')
        page.click('[data-action="project-menu"]')
        assert page.locator('[data-pop-action="archive-project"]').count() == 1, 'Archive project missing'
        page.click('[data-pop-action="archive-project"]')
        page.wait_for_timeout(50)
        assert page.evaluate("window.TodoApp.state.projects.find(p => p.id === 'project_client').isArchived") is True
        assert page.locator('.project-item[data-project-id="project_client"]').count() == 0
        page.click('[data-action="more-menu"]')
        page.click('[data-route="archived"]')
        page.wait_for_timeout(50)
        assert_text(page, '.page-title', 'Archived Projects')
        assert page.locator('[data-action="restore-project"][data-project-id="project_client"]').count() == 1
        page.click('[data-action="restore-project"][data-project-id="project_client"]')
        page.wait_for_timeout(30)
        assert page.evaluate("window.TodoApp.state.projects.find(p => p.id === 'project_client').isArchived") is False

        # Completed filters are present and persist into UI state.
        page.evaluate("location.hash = '#completed'")
        page.wait_for_timeout(50)
        assert page.locator('#completed-project-filter').count() == 1
        assert page.locator('#completed-period-filter').count() == 1
        page.select_option('#completed-project-filter', 'project_client')
        assert page.evaluate("window.TodoApp.state.ui.completedProjectFilter") == 'project_client'
        page.select_option('#completed-period-filter', '7')
        assert page.evaluate("window.TodoApp.state.ui.completedPeriod") == 7

        # Reminder scheduler fires on focus for a past reminder.
        active_id = page.evaluate("window.TodoApp.state.tasks.find(t => !t.isCompleted).id")
        page.evaluate(f"""() => {{ const t = window.TodoApp.state.tasks.find(x => x.id === '{active_id}'); t.reminderAt = new Date(Date.now()-60000).toISOString(); t.reminderFiredAt = null; }}""")
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        page.wait_for_timeout(30)
        assert 'Reminder:' in page.locator('#toast-root').inner_text()
        assert page.evaluate(f"Boolean(window.TodoApp.state.tasks.find(t => t.id === '{active_id}').reminderFiredAt)")

        # Global navigation shortcuts.
        page.keyboard.press('i')
        page.wait_for_timeout(30)
        assert page.evaluate('location.hash') == '#inbox'
        page.keyboard.press('u')
        page.wait_for_timeout(30)
        assert page.evaluate('location.hash') == '#upcoming'
        page.keyboard.press('t')
        page.wait_for_timeout(30)
        assert page.evaluate('location.hash') == '#today'
        page.keyboard.press('/')
        assert page.locator('#search-query').count() == 1, 'Slash search shortcut did not open Search'

        browser.close()

if __name__ == '__main__':
    main()
