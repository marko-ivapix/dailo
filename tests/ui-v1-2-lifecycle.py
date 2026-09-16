from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CORE = (ROOT / 'js' / 'core.js').read_text()
JSZIP = (ROOT / 'vendor' / 'jszip.min.js').read_text()
STORAGE = (ROOT / 'js' / 'storage.js').read_text()
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

def seed_state():
    return {
        'version': 2,
        'tasks': [], 'projects': [], 'tags': [],
        'settings': {'weekStartsOn': 'monday'},
        'ui': {'sidebarCollapsed': False, 'suggestionsExpanded': False, 'todayCompletedExpanded': False, 'projectCompletedExpanded': {}, 'completedPeriod': 0, 'completedProjectFilter': None, 'selectedTagId': None}
    }

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
    page.add_script_tag(content=STORAGE)
    page.add_script_tag(content=ATTACHMENTS)
    page.add_script_tag(content=BACKUP)
    page.add_script_tag(content=APP)
    page.wait_for_selector('.page-title')


def add_anytime_task_with_files(page, task_id='life_task', file_count=1):
    page.evaluate('''({taskId,fileCount}) => {
      const now = new Date().toISOString();
      window.TodoApp.state.tasks.push({id:taskId,title:'Lifecycle task',notes:'notes',projectId:null,plannedDate:null,dueDate:null,reminderAt:null,reminderFiredAt:null,recurrence:null,isInbox:false,isCompleted:false,completedAt:null,subtasks:[{id:'sub_a',title:'Sub',isCompleted:true,order:0}],tagIds:[],priority:'high',attachmentIds:[],todayOrder:null,projectOrder:null,inboxOrder:null,createdAt:now,updatedAt:now});
      location.hash='#anytime'; window.TodoApp.render();
    }''', {'taskId': task_id, 'fileCount': file_count})
    page.wait_for_timeout(20)
    page.click(f'[data-action="open-task"][data-task-id="{task_id}"]')
    for i in range(file_count):
        page.set_input_files('#attachment-input', files=[{'name':f'file-{i}.txt','mimeType':'text/plain','buffer':f'blob-{i}'.encode()}])
        page.wait_for_timeout(25)
    page.click('[data-action="close-modal"]')


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])

        # Attachment picker + drag/drop + delete/Undo + task delete/Undo.
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        boot(page, seed_state())
        add_anytime_task_with_files(page, 'life_task', 1)
        page.click('[data-action="open-task"][data-task-id="life_task"]')
        # Drag/drop must add an actual independent attachment.
        page.evaluate('''() => {
          const zone = document.querySelector('.attachment-drop-zone');
          const dt = new DataTransfer();
          dt.items.add(new File(['drop-bytes'], 'drop.txt', {type:'text/plain'}));
          zone.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));
          zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
        }''')
        page.wait_for_timeout(40)
        ids = page.evaluate("TodoApp.state.tasks.find(t=>t.id==='life_task').attachmentIds")
        assert len(ids) == 2
        drop_id = ids[1]
        assert page.evaluate("async id => (await TodoAttachments.get(id)).blob.text()", drop_id) == 'drop-bytes'

        # Open/download actions resolve the same stored Blob through object URLs.
        page.evaluate("""() => {
          window.__openedAttachment = null; window.__downloadedAttachment = null;
          URL.createObjectURL = () => 'blob:attachment-test'; URL.revokeObjectURL = () => {};
          window.open = url => { window.__openedAttachment = url; return null; };
          HTMLAnchorElement.prototype.click = function(){ window.__downloadedAttachment = {href:this.href,name:this.download}; };
        }""")
        page.click(f'[data-action="attachment-menu"][data-attachment-id="{drop_id}"]')
        menu = page.locator('.popover').inner_text()
        assert 'Open' in menu and 'Download' in menu and 'Delete' in menu
        page.click(f'[data-pop-action="attachment-open"][data-attachment-id="{drop_id}"]')
        assert page.evaluate("window.__openedAttachment") == 'blob:attachment-test'
        page.click(f'[data-action="attachment-menu"][data-attachment-id="{drop_id}"]')
        page.click(f'[data-pop-action="attachment-download"][data-attachment-id="{drop_id}"]')
        downloaded = page.evaluate("window.__downloadedAttachment")
        assert downloaded['name'] == 'drop.txt'

        # Attachment delete keeps Blob pending and Undo restores the exact ID/bytes.
        page.click(f'[data-action="attachment-menu"][data-attachment-id="{drop_id}"]')
        page.click(f'[data-pop-action="attachment-delete"][data-attachment-id="{drop_id}"]')
        assert page.locator('[data-action="confirm-action"]').count() == 1
        page.click('[data-action="confirm-action"]')
        page.wait_for_function('!document.querySelector("[data-action=confirm-action]") && !!document.querySelector("[data-action=undo]")')
        page.wait_for_timeout(20)
        after_delete = page.evaluate("id => ({refs:TodoApp.state.tasks.find(t=>t.id==='life_task').attachmentIds, rec:null})", drop_id)
        assert drop_id not in after_delete['refs']
        pending = page.evaluate("async id => await TodoAttachments.get(id)", drop_id)
        assert pending and pending['pendingDeleteUntil']
        page.click('[data-action="undo"]')
        page.wait_for_timeout(20)
        restored = page.evaluate("async id => { const t=TodoApp.state.tasks.find(t=>t.id==='life_task'); const r=await TodoAttachments.get(id); return {refs:t.attachmentIds,pending:r.pendingDeleteUntil,text:await r.blob.text()}; }", drop_id)
        assert drop_id in restored['refs'] and restored['pending'] is None and restored['text'] == 'drop-bytes'

        # Task delete retains attachment records pending, Undo restores task + same blobs.
        page.click('[data-action="open-task"][data-task-id="life_task"]')
        page.click('[data-action="delete-task"][data-task-id="life_task"]')
        assert page.locator('[data-action="confirm-action"]').count() == 1
        page.click('[data-action="confirm-action"]')
        page.wait_for_function('!document.querySelector("[data-action=confirm-action]") && !!document.querySelector("[data-action=undo]")')
        page.wait_for_timeout(20)
        assert page.evaluate("!TodoApp.state.tasks.some(t=>t.id==='life_task')")
        pending_all = page.evaluate("async ids => Promise.all(ids.map(async id => {const r=await TodoAttachments.get(id);return !!r?.pendingDeleteUntil;}))", ids)
        assert all(pending_all)
        page.click('[data-action="undo"]')
        page.wait_for_timeout(20)
        task_after_undo = page.evaluate("TodoApp.state.tasks.find(t=>t.id==='life_task')")
        assert task_after_undo and set(task_after_undo['attachmentIds']) == set(ids)
        pending_all = page.evaluate("async ids => Promise.all(ids.map(async id => (await TodoAttachments.get(id)).pendingDeleteUntil))", ids)
        assert pending_all == [None, None]

        # Duplicate with no files keeps metadata but no attachment refs; subtask gets a new ID/reset state.
        page.click('[data-action="task-menu"][data-task-id="life_task"]')
        page.click('[data-pop-action="task-duplicate"][data-task-id="life_task"]')
        assert page.locator('[data-action="duplicate-without-files"]').count() == 1
        page.click('[data-action="duplicate-without-files"]')
        page.wait_for_timeout(30)
        duplicates = page.evaluate("TodoApp.state.tasks.filter(t=>t.title==='Lifecycle task' && t.id!=='life_task')")
        assert len(duplicates) == 1
        no_file_copy = duplicates[0]
        assert no_file_copy['attachmentIds'] == [] and no_file_copy['priority'] == 'high'
        assert no_file_copy['subtasks'][0]['id'] != 'sub_a' and no_file_copy['subtasks'][0]['isCompleted'] is False
        page.click('[data-action="undo"]')

        # Duplicate with files creates independent IDs and Blob records owned by the new task.
        page.click('[data-action="task-menu"][data-task-id="life_task"]')
        page.click('[data-pop-action="task-duplicate"][data-task-id="life_task"]')
        page.click('[data-action="duplicate-with-files"]')
        page.wait_for_timeout(35)
        copy_with_files = page.evaluate("TodoApp.state.tasks.find(t=>t.title==='Lifecycle task' && t.id!=='life_task')")
        assert copy_with_files and len(copy_with_files['attachmentIds']) == 2
        assert set(copy_with_files['attachmentIds']).isdisjoint(set(ids))
        copy_records = page.evaluate("async ids => Promise.all(ids.map(async id => {const r=await TodoAttachments.get(id);return {id:r.id,taskId:r.taskId,text:await r.blob.text()};}))", copy_with_files['attachmentIds'])
        assert all(r['taskId'] == copy_with_files['id'] for r in copy_records)
        assert [r['text'] for r in copy_records] == ['blob-0', 'drop-bytes']
        page.click('[data-action="undo"]')

        # A failed multi-file duplicate rolls back partial copied records and never adds the duplicate task.
        original_ids = page.evaluate("TodoApp.state.tasks.find(t=>t.id==='life_task').attachmentIds.slice()")
        before_task_count = page.evaluate("TodoApp.state.tasks.length")
        page.evaluate("""() => {
          window.__originalAttachmentPut = TodoAttachments.put;
          let copied = 0;
          TodoAttachments.put = async record => {
            if (record.taskId !== 'life_task') { copied += 1; if (copied === 2) throw new Error('forced duplicate failure'); }
            return window.__originalAttachmentPut(record);
          };
        }""")
        page.click('[data-action="task-menu"][data-task-id="life_task"]')
        page.click('[data-pop-action="task-duplicate"][data-task-id="life_task"]')
        page.click('[data-action="duplicate-with-files"]')
        page.wait_for_timeout(40)
        page.evaluate("() => { TodoAttachments.put = window.__originalAttachmentPut; return true; }")
        assert page.evaluate("TodoApp.state.tasks.length") == before_task_count
        remaining_ids = page.evaluate("async () => (await TodoAttachments.listAll()).map(x=>x.id).sort()")
        assert remaining_ids == sorted(original_ids)

        # Attachment count cap is enforced; the 11th file is rejected.
        page_limit = browser.new_page(viewport={'width': 1440, 'height': 1000})
        boot(page_limit, seed_state())
        add_anytime_task_with_files(page_limit, 'limit_task', 10)
        page_limit.click('[data-action="open-task"][data-task-id="limit_task"]')
        page_limit.set_input_files('#attachment-input', files=[{'name':'eleven.txt','mimeType':'text/plain','buffer':b'11'}])
        page_limit.wait_for_timeout(25)
        assert len(page_limit.evaluate("TodoApp.state.tasks.find(t=>t.id==='limit_task').attachmentIds")) == 10
        assert "limit is 10" in page_limit.locator('.attachment-message').inner_text()

        # >10 MB is rejected without creating an attachment reference.
        huge = b'x' * (10 * 1024 * 1024 + 1)
        page_large = browser.new_page(viewport={'width': 1440, 'height': 1000})
        boot(page_large, seed_state())
        page_large.evaluate('''() => { const now=new Date().toISOString(); TodoApp.state.tasks.push({id:'large_task',title:'Large',notes:'',projectId:null,plannedDate:null,dueDate:null,reminderAt:null,reminderFiredAt:null,recurrence:null,isInbox:false,isCompleted:false,completedAt:null,subtasks:[],tagIds:[],priority:'none',attachmentIds:[],todayOrder:null,projectOrder:null,inboxOrder:null,createdAt:now,updatedAt:now}); location.hash='#anytime'; TodoApp.render(); }''')
        page_large.click('[data-action="open-task"][data-task-id="large_task"]')
        page_large.set_input_files('#attachment-input', files=[{'name':'huge.bin','mimeType':'application/octet-stream','buffer':huge}])
        page_large.wait_for_timeout(30)
        assert page_large.evaluate("TodoApp.state.tasks.find(t=>t.id==='large_task').attachmentIds.length") == 0
        assert 'larger than 10 MB' in page_large.locator('.attachment-message').inner_text()

        # Backup export contains manifest + referenced attachment file, inspect succeeds.
        page_backup = browser.new_page(viewport={'width': 1440, 'height': 1000})
        boot(page_backup, seed_state())
        backup_result = page_backup.evaluate('''async () => {
          const now = new Date().toISOString();
          TodoApp.state.tags.push({id:'tag_b',name:'Backup',color:'#30CBAD',createdAt:now,updatedAt:now});
          TodoApp.state.tasks.push({id:'backup_task',title:'Backup task',notes:'',projectId:null,plannedDate:null,dueDate:null,reminderAt:null,reminderFiredAt:null,recurrence:null,isInbox:false,isCompleted:false,completedAt:null,subtasks:[],tagIds:['tag_b'],priority:'medium',attachmentIds:['backup_att'],todayOrder:null,projectOrder:null,inboxOrder:null,createdAt:now,updatedAt:now});
          const blob = new Blob(['backup-bytes'],{type:'text/plain'});
          await TodoAttachments.put({id:'backup_att',taskId:'backup_task',fileName:'proof.txt',mimeType:'text/plain',size:blob.size,blob,createdAt:now,updatedAt:now,pendingDeleteUntil:null});
          const zipBlob = await TodoBackup.exportBackup(TodoApp.state, TodoAttachments, '2026-09-15T20:00:00.000Z');
          const zip = await JSZip.loadAsync(zipBlob);
          const manifest = JSON.parse(await zip.file('data.json').async('string'));
          const meta = manifest.attachments[0];
          const text = await zip.file(meta.path).async('string');
          const inspected = await TodoBackup.inspectBackup(zipBlob);
          window.__validBackupBlob = zipBlob;
          return {files:Object.keys(zip.files),manifest,text,summary:inspected.summary};
        }''')
        assert 'data.json' in backup_result['files']
        assert backup_result['manifest']['backupVersion'] == 1 and backup_result['manifest']['appVersion'] == '1.2'
        assert backup_result['text'] == 'backup-bytes'
        assert backup_result['summary']['attachments'] == 1 and backup_result['summary']['tags'] == 1

        # Invalid backup inspection does not mutate current app state/store.
        invalid = page_backup.evaluate('''async () => {
          const beforeState = JSON.stringify(TodoApp.state);
          const beforeIds = (await TodoAttachments.listAll()).map(x=>x.id).sort();
          const z = new JSZip(); z.file('not-data.txt','bad'); const bad = await z.generateAsync({type:'blob'});
          let failed=false; try { await TodoBackup.inspectBackup(bad); } catch(e) { failed=true; }
          const afterIds = (await TodoAttachments.listAll()).map(x=>x.id).sort();
          return {failed,beforeState,afterState:JSON.stringify(TodoApp.state),beforeIds,afterIds};
        }''')
        assert invalid['failed'] and invalid['beforeState'] == invalid['afterState'] and invalid['beforeIds'] == invalid['afterIds']

        # Valid restore replaces attachment store and target state.
        restore = page_backup.evaluate('''async () => {
          const validated = await TodoBackup.inspectBackup(window.__validBackupBlob);
          const old = JSON.parse(JSON.stringify(TodoApp.state));
          TodoApp.state.tasks.length=0; TodoApp.state.tags.length=0;
          await TodoAttachments.clearAll();
          let current = JSON.parse(JSON.stringify(TodoApp.state));
          await TodoBackup.restoreBackup(validated,{attachmentApi:TodoAttachments,readState:async()=>current,writeState:async next=>{current=next;}});
          const rec = await TodoAttachments.get('backup_att');
          return {task:current.tasks.find(t=>t.id==='backup_task'),tag:current.tags.find(t=>t.id==='tag_b'),blob:await rec.blob.text()};
        }''')
        assert restore['task']['priority'] == 'medium' and restore['tag']['name'] == 'Backup' and restore['blob'] == 'backup-bytes'

        # Restore rolls attachment store back if metadata-state write fails.
        rollback = page_backup.evaluate('''async () => {
          const now=new Date().toISOString();
          await TodoAttachments.clearAll();
          const oldBlob=new Blob(['old-bytes'],{type:'text/plain'});
          await TodoAttachments.put({id:'old_att',taskId:'old_task',fileName:'old.txt',mimeType:'text/plain',size:oldBlob.size,blob:oldBlob,createdAt:now,updatedAt:now,pendingDeleteUntil:null});
          const oldState={version:2,tasks:[{id:'old_task',title:'Old',notes:'',projectId:null,plannedDate:null,dueDate:null,reminderAt:null,reminderFiredAt:null,recurrence:null,isInbox:false,isCompleted:false,completedAt:null,subtasks:[],tagIds:[],priority:'none',attachmentIds:['old_att'],todayOrder:null,projectOrder:null,inboxOrder:null,createdAt:now,updatedAt:now}],projects:[],tags:[],settings:{},ui:{}};
          const validated=await TodoBackup.inspectBackup(window.__validBackupBlob);
          let writes=0; let current=oldState; let failed=false;
          try { await TodoBackup.restoreBackup(validated,{attachmentApi:TodoAttachments,readState:async()=>current,writeState:async next=>{writes++; if(writes===1) throw new Error('forced'); current=next;}}); } catch(e) { failed=true; }
          const all=await TodoAttachments.listAll();
          return {failed,currentTitle:current.tasks[0].title,ids:all.map(x=>x.id),text:await all[0].blob.text()};
        }''')
        assert rollback['failed'] and rollback['currentTitle'] == 'Old' and rollback['ids'] == ['old_att'] and rollback['text'] == 'old-bytes'

        # Reset app clears metadata and attachment storage together.
        page_reset = browser.new_page(viewport={'width': 1440, 'height': 1000})
        boot(page_reset, seed_state())
        add_anytime_task_with_files(page_reset, 'reset_task', 1)
        assert page_reset.evaluate("TodoAttachments.listAll().then(x=>x.length)") == 1
        page_reset.evaluate("location.hash='#settings'; TodoApp.render()")
        page_reset.click('[data-action="reset-app"]')
        page_reset.click('[data-action="confirm-action"]')
        page_reset.wait_for_timeout(30)
        assert page_reset.evaluate("TodoApp.state.tasks.length") == 0
        assert page_reset.evaluate("TodoApp.state.tags.length") == 0
        assert page_reset.evaluate("TodoAttachments.listAll().then(x=>x.length)") == 0
        persisted = page_reset.evaluate("JSON.parse(localStorage.getItem('todoAppData'))")
        assert persisted['version'] == 3 and persisted['tasks'] == []

        browser.close()

if __name__ == '__main__':
    main()
