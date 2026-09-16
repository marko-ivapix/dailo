from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CORE = (ROOT / 'js' / 'core.js').read_text()
JSZIP = (ROOT / 'vendor' / 'jszip.min.js').read_text()
ATTACHMENTS = (ROOT / 'js' / 'attachments.js').read_text()
BACKUP = (ROOT / 'js' / 'backup.js').read_text()
APP = (ROOT / 'js' / 'app.js').read_text()
SHELL = '''<!doctype html><html><body>
<div id="app" class="app-shell" aria-live="polite">
  <aside id="sidebar" class="sidebar" aria-label="Primary navigation"></aside>
  <main id="main" class="main" tabindex="-1"></main>
</div>
<div id="modal-root"></div>
<div id="toast-root" class="toast-root" aria-live="assertive" aria-atomic="true"></div>
</body></html>'''

def boot(page, seed=None):
    page.set_content(SHELL)
    page.evaluate("location.hash = '#today'")
    page.evaluate('''(seed) => {
      window.__TODO_TEST_MEMORY_DB__ = true;
      const data = new Map();
      if (seed) data.set('todoAppData', JSON.stringify(seed));
      Object.defineProperty(window, 'localStorage', { value: {
        getItem: key => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key),
        clear: () => data.clear()
      }, configurable: true });
    }''', seed)
    page.add_script_tag(content=JSZIP)
    page.add_script_tag(content=CORE)
    page.add_script_tag(content=ATTACHMENTS)
    page.add_script_tag(content=BACKUP)
    page.add_script_tag(content=APP)
    page.wait_for_selector('.page-title')


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        boot(page)

        # Attachment adapter lifecycle through the same public API used by production.
        result = page.evaluate("""async () => {
          const A = window.TodoAttachments;
          await A.clearAll();
          const blob = new Blob(['hello attachment'], {type:'text/plain'});
          const record = {id:'att_test', taskId:'task_test', fileName:'hello.txt', mimeType:'text/plain', size:blob.size, blob, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), pendingDeleteUntil:null};
          await A.put(record);
          const one = await A.get('att_test');
          const byTask = await A.listByTask('task_test');
          const text = await one.blob.text();
          await A.markPending(['att_test'], new Date(Date.now()+60000).toISOString());
          const pending = await A.get('att_test');
          await A.restorePending(['att_test']);
          const restored = await A.get('att_test');
          await A.markPending(['att_test'], new Date(Date.now()-60000).toISOString());
          const cleaned = await A.cleanupExpired(new Date().toISOString());
          const afterCleanup = await A.get('att_test');
          return {text, byTask:byTask.map(x=>x.id), pending:Boolean(pending.pendingDeleteUntil), restored:restored.pendingDeleteUntil, cleaned, afterCleanup};
        }""")
        assert result['text'] == 'hello attachment'
        assert result['byTask'] == ['att_test']
        assert result['pending'] is True
        assert result['restored'] is None
        assert result['cleaned'] == 1
        assert result['afterCleanup'] is None

        # V1.2 Tags screen is a primary sidebar destination with CRUD controls.
        assert page.locator('[data-route="tags"]').count() == 1, 'Tags sidebar entry missing'
        page.click('[data-route="tags"]')
        page.wait_for_timeout(20)
        assert 'Tags' in page.locator('.page-title').inner_text()
        assert page.locator('[data-action="new-tag"]').count() >= 1
        page.click('[data-action="new-tag"]')
        assert page.locator('#tag-name').count() == 1
        page.fill('#tag-name', 'WordPress')
        page.click('[data-action="save-tag"]')
        page.wait_for_timeout(20)
        assert page.locator('.tag-row', has_text='WordPress').count() == 1
        assert page.evaluate("window.TodoApp.state.tags.some(t => t.name === 'WordPress')")
        wordpress_id = page.evaluate("window.TodoApp.state.tags.find(t => t.name === 'WordPress').id")
        page.click('[data-action="new-tag"]')
        page.fill('#tag-name', 'Client')
        page.click('[data-action="save-tag"]')
        page.wait_for_timeout(20)
        client_id = page.evaluate("window.TodoApp.state.tags.find(t => t.name === 'Client').id")

        # Quick Add More supports multiple global tags, priority and deterministic trailing-date parsing.
        page.evaluate("location.hash='#today'")
        page.wait_for_timeout(20)
        page.evaluate('window.TodoApp.openQuickAdd()')
        page.click('[data-action="toggle-quick-more"]')
        assert page.locator('[data-action="quick-tags-picker"]').count() == 1
        assert page.locator('[data-action="quick-priority-picker"]').count() == 1
        page.click('[data-action="quick-tags-picker"]')
        page.click(f'[data-pop-action="toggle-tag"][data-tag-id="{wordpress_id}"]')
        page.click('[data-action="quick-tags-picker"]')
        page.click(f'[data-pop-action="toggle-tag"][data-tag-id="{client_id}"]')
        page.fill('#quick-title', 'NLP smoke tomorrow')
        page.wait_for_timeout(20)
        assert 'Tomorrow' in page.locator('[data-action="quick-plan-picker"]').inner_text()
        page.click('[data-action="quick-priority-picker"]')
        page.click('[data-pop-action="set-priority"][data-priority="high"]')
        page.click('[data-action="create-task"]')
        page.wait_for_timeout(20)
        created = page.evaluate("window.TodoApp.state.tasks.find(t => t.title === 'NLP smoke')")
        assert created and created['priority'] == 'high'
        assert set(created['tagIds']) == {wordpress_id, client_id}

        # Task Detail exposes tags, priority and real attachment controls.
        created_id = created['id']
        page.evaluate("location.hash='#upcoming'")
        page.wait_for_timeout(30)
        page.click(f'[data-action="open-task"][data-task-id="{created_id}"]')
        assert page.locator('[data-action="task-tags-picker"]').count() == 1
        assert page.locator('[data-action="task-priority-picker"]').count() == 1
        assert page.locator('#attachment-input').count() == 1
        page.click('[data-action="task-tags-picker"]')
        page.click('[data-pop-action="inline-new-tag"]')
        page.fill('#inline-tag-name', 'Research')
        page.click('[data-pop-action="inline-tag-create"]')
        page.wait_for_timeout(20)
        research_id = page.evaluate("TodoApp.state.tags.find(t=>t.name==='Research').id")
        assert set(page.evaluate(f"TodoApp.state.tasks.find(t=>t.id==='{created_id}').tagIds")) == {wordpress_id, client_id, research_id}
        page.set_input_files('#attachment-input', files=[{'name':'smoke.txt','mimeType':'text/plain','buffer':b'attachment smoke'}])
        page.wait_for_timeout(60)
        assert page.locator('.attachment-row', has_text='smoke.txt').count() == 1
        att_ids = page.evaluate(f"window.TodoApp.state.tasks.find(t => t.id === '{created_id}').attachmentIds")
        assert len(att_ids) == 1
        blob_text = page.evaluate("""async id => (await window.TodoAttachments.get(id)).blob.text()""", att_ids[0])
        assert blob_text == 'attachment smoke'

        # Context menu exposes duplicate and full movement actions.
        page.click('[data-action="close-modal"]')
        page.click(f'[data-action="task-menu"][data-task-id="{created_id}"]')
        menu_text = page.locator('.popover').inner_text()
        assert 'Duplicate' in menu_text and 'Plan for' in menu_text and 'Change due date' in menu_text and 'Move to project' in menu_text

        page.keyboard.press('Escape')

        # Global tag edit propagates everywhere; delete removes references but not tasks.
        page.evaluate("location.hash='#tags'")
        page.wait_for_timeout(20)
        wp_row = page.locator(f'.tag-row[data-tag-id="{wordpress_id}"]')
        wp_row.locator('[data-action="tag-menu"]').click()
        page.click(f'[data-pop-action="edit-tag"][data-tag-id="{wordpress_id}"]')
        page.fill('#tag-name', 'WordPress Pro')
        page.click('[data-action="save-tag"]')
        page.wait_for_timeout(20)
        assert page.locator(f'.tag-row[data-tag-id="{wordpress_id}"]', has_text='WordPress Pro').count() == 1
        assert wordpress_id in page.evaluate(f"TodoApp.state.tasks.find(t=>t.id==='{created_id}').tagIds")
        page.locator(f'.tag-row[data-tag-id="{wordpress_id}"] [data-action="tag-menu"]').click()
        page.click(f'[data-pop-action="delete-tag"][data-tag-id="{wordpress_id}"]')
        assert page.locator('[data-action="confirm-action"]').count() == 1
        page.click('[data-action="confirm-action"]')
        page.wait_for_timeout(20)
        assert page.evaluate(f"TodoApp.state.tasks.some(t=>t.id==='{created_id}')")
        assert wordpress_id not in page.evaluate(f"TodoApp.state.tasks.find(t=>t.id==='{created_id}').tagIds")
        assert page.locator(f'.tag-row[data-tag-id="{client_id}"]').count() == 1
        page.click(f'[data-action="select-tag"][data-tag-id="{client_id}"]')
        assert page.locator('.selected-tag-section .task-row', has_text='NLP smoke').count() == 1

        # Advanced drag/drop exposes Today, Tomorrow and project context targets.
        page.evaluate("""() => {
          const now = new Date().toISOString();
          window.TodoApp.state.projects.push({id:'drag_project',name:'Drag Project',color:'#5362FF',order:999,isArchived:false,archivedAt:null,createdAt:now,updatedAt:now});
          window.TodoApp.state.tasks.push({id:'drag_task',title:'Drag me',notes:'',projectId:null,plannedDate:null,dueDate:null,reminderAt:null,reminderFiredAt:null,recurrence:null,isInbox:true,isCompleted:false,completedAt:null,subtasks:[],tagIds:[],priority:'none',attachmentIds:[],todayOrder:null,projectOrder:null,inboxOrder:999,createdAt:now,updatedAt:now});
          location.hash = '#inbox'; window.TodoApp.render();
        }""")
        page.wait_for_timeout(20)
        assert page.locator('[data-drop-plan="today"]').count() == 1
        assert page.locator('[data-drop-plan="tomorrow"]').count() == 1
        assert page.locator('[data-drop-project-id="drag_project"]').count() == 1
        page.evaluate("""() => {
          const source = document.querySelector('[data-task-id="drag_task"].task-row');
          const target = document.querySelector('[data-drop-plan="today"]');
          const dt = new DataTransfer();
          source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));
          target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));
          target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
        }""")
        moved = page.evaluate("window.TodoApp.state.tasks.find(t=>t.id==='drag_task')")
        assert moved['plannedDate'] == page.evaluate("TodoCore.dateOnly()") and moved['isInbox'] is False

        # Undo restores the exact pre-drop context.
        page.click('[data-action="undo"]')
        restored = page.evaluate("window.TodoApp.state.tasks.find(t=>t.id==='drag_task')")
        assert restored['plannedDate'] is None and restored['isInbox'] is True

        # Project and Tomorrow targets perform contextual moves too.
        page.evaluate("""() => {
          const source = document.querySelector('[data-task-id="drag_task"].task-row');
          const target = document.querySelector('[data-drop-project-id="drag_project"]');
          const dt = new DataTransfer();
          source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));
          target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
        }""")
        moved_project = page.evaluate("window.TodoApp.state.tasks.find(t=>t.id==='drag_task')")
        assert moved_project['projectId'] == 'drag_project' and moved_project['isInbox'] is False
        page.click('[data-action="undo"]')

        page.evaluate("""() => {
          const source = document.querySelector('[data-task-id="drag_task"].task-row');
          const target = document.querySelector('[data-drop-plan="tomorrow"]');
          const dt = new DataTransfer();
          source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));
          target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
        }""")
        moved_tomorrow = page.evaluate("window.TodoApp.state.tasks.find(t=>t.id==='drag_task')")
        assert moved_tomorrow['plannedDate'] == page.evaluate("TodoCore.addDays(TodoCore.dateOnly(),1)") and moved_tomorrow['isInbox'] is False

        # Settings uses ZIP backup/restore controls and no bulk UI is introduced.
        page.evaluate("location.hash='#settings'")
        page.wait_for_timeout(20)
        assert page.locator('[data-action="export-backup"]').count() == 1
        assert page.locator('[data-action="import-backup"]').count() == 1
        assert page.locator('[data-action="export-data"]').count() == 0
        assert page.locator('[data-action*="bulk"], [data-action="select-all"]').count() == 0
        assert page.evaluate("typeof window.TodoBackup === 'object'"), 'TodoBackup module missing'

        # Confirmation dialogs trap focus and return it to their trigger on close.
        reset_trigger = page.locator('[data-action="reset-app"]')
        reset_trigger.focus()
        reset_trigger.click()
        page.wait_for_timeout(20)
        assert page.evaluate("!!document.activeElement.closest('.modal')"), 'Modal did not receive focus'
        page.keyboard.press('Escape')
        page.wait_for_timeout(20)
        assert page.evaluate("document.activeElement?.dataset?.action === 'reset-app'"), 'Focus did not return to modal trigger'

        # Legacy v1 state migrates in-app to v2 without losing v1.1 fields.
        legacy = {
            'version': 1,
            'tasks': [{
                'id':'legacy_task','title':'Legacy task','notes':'','projectId':'legacy_project',
                'plannedDate':None,'dueDate':None,'reminderAt':'2026-09-16T09:00:00.000Z',
                'reminderFiredAt':None,'recurrence':{'frequency':'weekly','interval':1},
                'isInbox':False,'isCompleted':False,'completedAt':None,'subtasks':[],
                'todayOrder':None,'projectOrder':0,'inboxOrder':None,
                'createdAt':'2026-09-10T10:00:00.000Z','updatedAt':'2026-09-10T10:00:00.000Z'
            }],
            'projects':[{'id':'legacy_project','name':'Legacy project','color':'#5362FF','order':0,'isArchived':True,'archivedAt':'2026-09-01T10:00:00.000Z'}],
            'settings':{'weekStartsOn':'monday'},
            'ui':{'sidebarCollapsed':True,'completedPeriod':7}
        }
        page2 = browser.new_page(viewport={"width": 1440, "height": 1000})
        boot(page2, legacy)
        migrated = page2.evaluate("window.TodoApp.state")
        assert migrated['version'] == 2
        assert migrated['tags'] == []
        assert migrated['tasks'][0]['priority'] == 'none'
        assert migrated['tasks'][0]['tagIds'] == []
        assert migrated['tasks'][0]['attachmentIds'] == []
        assert migrated['tasks'][0]['recurrence']['frequency'] == 'weekly'
        assert migrated['projects'][0]['isArchived'] is True
        assert migrated['ui']['completedPeriod'] == 7
        persisted = page2.evaluate("JSON.parse(localStorage.getItem('todoAppData'))")
        assert persisted['version'] == 2

        browser.close()

if __name__ == '__main__':
    main()
