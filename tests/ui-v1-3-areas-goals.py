from pathlib import Path
import shutil

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CORE = (ROOT / 'js' / 'core.js').read_text()
JSZIP = (ROOT / 'vendor' / 'jszip.min.js').read_text()
STORAGE = (ROOT / 'js' / 'storage.js').read_text()
ATTACHMENTS = (ROOT / 'js' / 'attachments.js').read_text()
BACKUP = (ROOT / 'js' / 'backup.js').read_text()
APP = (ROOT / 'js' / 'app.js').read_text()
SHELL = '''<!doctype html><html><body>
<div id="app" class="app-shell" aria-live="polite"><aside id="sidebar" class="sidebar"></aside><main id="main" class="main" tabindex="-1"></main></div>
<div id="modal-root"></div><div id="toast-root" class="toast-root"></div>
</body></html>'''


def chromium_path():
    return (shutil.which('chromium') or shutil.which('chromium-browser')
            or next((str(path) for path in [
                Path('/usr/bin/chromium'),
                Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
                Path('/Applications/Chromium.app/Contents/MacOS/Chromium'),
            ] if path.exists()), None))


def seed_state():
    return {
        'version': 3, 'tasks': [], 'projects': [], 'tags': [], 'areas': [],
        'goals': [], 'habits': [], 'templates': [], 'savedViews': [],
        'settings': {'weekStartsOn': 'monday'}, 'ui': {},
    }


def boot(page):
    page.set_content(SHELL)
    page.evaluate("location.hash = '#today'")
    page.evaluate('''(seed) => {
      window.__TODO_TEST_MEMORY_DB__ = true;
      const data = new Map([['todoAppData', JSON.stringify(seed)]]);
      Object.defineProperty(window, 'localStorage', { value: {
        getItem: key => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key), clear: () => data.clear(),
      }, configurable: true });
    }''', seed_state())
    for script in [JSZIP, CORE, STORAGE, ATTACHMENTS, BACKUP, APP]:
        page.add_script_tag(content=script)
    page.wait_for_selector('.page-title')


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=chromium_path(), args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        boot(page)

        # Create Business, pin it, and use the Area Detail context actions.
        page.click('[data-route="areas"]')
        page.click('[data-action="new-area"]')
        page.fill('#area-name', 'Business')
        page.click('[data-action="save-area"]')
        area_id = page.evaluate("TodoApp.state.areas[0].id")
        page.click('[data-action="area-menu"]')
        page.click('[data-pop-action="pin-area"]')
        assert page.locator(f'#sidebar [data-route="area/{area_id}"]').count() == 1

        page.click(f'[data-route="area/{area_id}"]')
        page.click('[data-action="area-new-task"]')
        page.fill('#quick-title', 'Call accountant')
        page.click('[data-action="create-task"]')
        task = page.evaluate("TodoApp.state.tasks.find(t => t.title === 'Call accountant')")
        assert task['areaId'] == area_id and task['projectId'] is None

        page.click('[data-action="area-new-project"]')
        page.fill('#project-name', 'Client work')
        page.click('[data-action="save-project"]')
        project = page.evaluate("TodoApp.state.projects.find(p => p.name === 'Client work')")
        assert project['areaId'] == area_id

        # Assigning a project clears the direct Area; removing it does not invent one.
        page.click(f'[data-action="open-task"][data-task-id="{task["id"]}"]')
        page.click(f'[data-action="task-project-picker"][data-task-id="{task["id"]}"]')
        page.click(f'[data-pop-action="set-project"][data-project-id="{project["id"]}"]')
        assert page.evaluate("id => TodoApp.state.tasks.find(t => t.id === id).areaId", task['id']) is None

        # Archive leaves all links in place; restore returns the Area to active state.
        page.evaluate(f"location.hash = '#area/{area_id}'; TodoApp.render()")
        page.click('[data-action="area-menu"]')
        page.click('[data-pop-action="archive-area"]')
        archived = page.evaluate("id => ({area: TodoApp.state.areas.find(a => a.id === id), project: TodoApp.state.projects[0]})", area_id)
        assert archived['area']['status'] == 'archived' and archived['project']['areaId'] == area_id
        page.evaluate("location.hash = '#areas'; TodoApp.render()")
        page.click('[data-tab="archived"]')
        page.click('[data-action="area-menu"]')
        page.click('[data-pop-action="restore-area"]')
        assert page.evaluate("id => TodoApp.state.areas.find(a => a.id === id).status", area_id) == 'active'

        # Delete clears linked Area refs only; Undo restores the whole snapshot.
        page.evaluate(f"location.hash = '#area/{area_id}'; TodoApp.render()")
        page.click('[data-action="area-menu"]')
        page.click('[data-pop-action="delete-area"]')
        page.click('[data-action="confirm-action"]')
        deleted = page.evaluate("({areas: TodoApp.state.areas, project: TodoApp.state.projects[0], task: TodoApp.state.tasks[0]})")
        assert deleted['areas'] == [] and deleted['project']['areaId'] is None and deleted['task']['areaId'] is None
        page.click('[data-action="undo"]')
        restored = page.evaluate("id => ({area: TodoApp.state.areas.find(a => a.id === id), project: TodoApp.state.projects[0], task: TodoApp.state.tasks[0]})", area_id)
        assert restored['area'] and restored['project']['areaId'] == area_id and restored['task']['areaId'] is None
        browser.close()


if __name__ == '__main__':
    main()
