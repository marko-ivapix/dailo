import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CORE = (ROOT / 'js' / 'core.js').read_text()
JSZIP = (ROOT / 'vendor' / 'jszip.min.js').read_text()
STORAGE = (ROOT / 'js' / 'storage.js').read_text()
ATTACHMENTS = (ROOT / 'js' / 'attachments.js').read_text()
BACKUP = (ROOT / 'js' / 'backup.js').read_text()
APP = (ROOT / 'js' / 'app.js').read_text()
MODULES = [(ROOT / 'js' / name).read_text() for name in ('domain-modules.js', 'knowledge.js', 'goals-ui.js', 'habits-ui.js', 'saved-views-ui.js', 'projects-ui.js', 'areas-ui.js', 'settings-ui.js', 'templates-ui.js', 'calendar-ui.js', 'tasks-ui.js', 'cleaning-ui.js')]
SHELL = '''<!doctype html><html><body>
<div id="app" class="app-shell" aria-live="polite">
  <aside id="sidebar" class="sidebar" aria-label="Primary navigation"></aside>
  <main id="main" class="main" tabindex="-1"></main>
</div>
<div id="modal-root"></div>
<div id="toast-root" class="toast-root" aria-live="assertive" aria-atomic="true"></div>
</body></html>'''


def v2_state(title):
    return {
        'version': 2,
        'tasks': [{
            'id': 'task-1', 'title': title, 'notes': '', 'projectId': None,
            'plannedDate': None, 'dueDate': None, 'tagIds': [], 'priority': 'none',
            'attachmentIds': [], 'isInbox': False, 'isCompleted': False,
            'subtasks': [], 'createdAt': '2026-09-16T00:00:00.000Z',
            'updatedAt': '2026-09-16T00:00:00.000Z',
        }],
        'projects': [], 'tags': [], 'settings': {'weekStartsOn': 'monday'}, 'ui': {},
    }


def boot(page, seed):
    page.set_content(SHELL)
    page.evaluate("location.hash = '#today'")
    page.evaluate('''(seed) => {
      window.__TODO_TEST_MEMORY_DB__ = true;
      const data = new Map();
      if (seed) data.set('todoAppData', JSON.stringify(seed));
      Object.defineProperty(window, 'localStorage', { value: {
        getItem: key => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key), clear: () => data.clear(),
      }, configurable: true });
    }''', seed)
    page.add_script_tag(content=JSZIP)
    page.add_script_tag(content=CORE)
    page.add_script_tag(content=STORAGE)
    page.add_script_tag(content=ATTACHMENTS)
    page.add_script_tag(content=BACKUP)
    for script in MODULES + [APP]:
        page.add_script_tag(content=script)
    page.wait_for_selector('.page-title')


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})

        boot(page, v2_state('Loaded V2 task'))
        assert page.evaluate('Boolean(window.TodoStorage && window.TodoAttachments && window.TodoBackup)')
        loaded = page.evaluate('''() => ({
          state: TodoApp.state,
          persisted: JSON.parse(localStorage.getItem('todoAppData')),
        })''')
        assert loaded['state']['version'] == 3
        assert loaded['state']['tasks'][0]['goalIds'] == []
        assert loaded['persisted']['version'] == 3

        page.evaluate('''next => window.dispatchEvent(new StorageEvent('storage', {
          key: 'todoAppData', newValue: JSON.stringify(next),
        }))''', v2_state('Storage V2 task'))
        updated = page.evaluate('() => TodoApp.state')
        assert updated['version'] == 3
        assert updated['tasks'][0]['title'] == 'Storage V2 task'
        assert updated['tasks'][0]['plannedTime'] is None

        sample_page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        boot(sample_page, None)
        sample = sample_page.evaluate('() => TodoApp.state')
        assert sample['version'] == 3
        assert sample['projects'][0]['areaId'] is None
        assert sample['projects'][0]['goalIds'] == []
        assert sample['projects'][0]['isArchived'] is False
        browser.close()


if __name__ == '__main__':
    main()
