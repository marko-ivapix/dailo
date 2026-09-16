"""Delete/Undo safety on a disposable HTTP origin and actual IndexedDB bytes.

Each fixture is independent. Clock control belongs to Playwright, not runtime.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import sys
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
TYPES = ['task', 'subtask', 'project', 'tag', 'area', 'goal', 'habit',
         'milestone', 'attachment', 'template', 'saved-view', 'clear-completed']
SEED = {
    'version': 3, 'settings': {}, 'ui': {},
    'tags': [{'id': 'other-tag', 'name': 'Other'}, {'id': 'tag', 'name': 'Focus'}],
    'areas': [{'id': 'a', 'name': 'Work', 'status': 'active', 'isPinned': True}],
    'projects': [{'id': 'p0', 'name': 'Other project'}, {'id': 'p', 'name': 'Project', 'areaId': 'a', 'goalIds': ['g0', 'g']}],
    'tasks': [
        {'id': 't0', 'title': 'Other task', 'plannedDate': '2026-10-24', 'goalIds': ['g'], 'tagIds': ['tag']},
        {'id': 't', 'title': 'Deep task', 'projectId': 'p', 'goalIds': ['g0', 'g'], 'tagIds': ['other-tag', 'tag'],
         'plannedDate': '2026-10-24', 'plannedTime': '08:15', 'dueDate': '2026-10-27', 'dueTime': '17:00',
         'reminderAt': '2026-10-26T12:00:00Z', 'notes': 'Keep all notes', 'attachmentIds': ['f', 'f2'],
         'recurrence': {'frequency': 'weekly', 'interval': 2, 'seriesId': 'series-old', 'status': 'paused',
                        'occurrencesCreated': 4, 'endType': 'afterOccurrences', 'endAfterOccurrences': 8, 'skipNext': True},
         'recurrenceSuccessorId': 'done',
         'recurrenceBaseline': {'title': 'Original generation title', 'notes': 'Original generation notes',
                                'projectId': 'p', 'areaId': None, 'goalIds': ['g0', 'g'], 'tagIds': ['other-tag', 'tag'],
                                'plannedDate': '2026-10-20', 'dueDate': '2026-10-23', 'plannedTime': '07:30', 'dueTime': '16:00',
                                'reminderAt': '2026-10-28T12:00:00Z', 'attachmentIds': ['f', 'f2'],
                                'subtasks': [{'id': 'baseline-child', 'title': 'Original child', 'isCompleted': False, 'order': 0}],
                                'recurrence': {'frequency': 'daily', 'interval': 3, 'seriesId': 'series-old', 'status': 'active', 'occurrencesCreated': 3, 'endType': 'never', 'skipNext': False}},
         'subtasks': [{'id': 's0', 'title': 'First', 'order': 0}, {'id': 's', 'title': 'Middle', 'order': 1, 'isCompleted': True}, {'id': 's2', 'title': 'Last', 'order': 2}]},
        {'id': 'done', 'title': 'Completed', 'projectId': 'p', 'isCompleted': True, 'completedAt': '2026-10-23T12:00:00Z', 'attachmentIds': ['fd'], 'goalIds': ['g'], 'tagIds': ['tag']},
        {'id': 'standalone', 'title': 'Standalone', 'areaId': 'a', 'plannedDate': '2026-10-24'},
    ],
    'goals': [{'id': 'g0', 'title': 'Other Goal'}, {'id': 'g', 'title': 'Goal', 'areaId': 'a', 'progressMode': 'linkedTasks',
               'taskIds': ['t0', 't', 'done'], 'projectLinks': [{'projectId': 'p0', 'contributionMode': 'allTasks', 'selectedTaskIds': []}, {'projectId': 'p', 'contributionMode': 'selectedTasks', 'selectedTaskIds': ['t', 'done']}],
               'habitLinks': [{'habitId': 'h0', 'metric': 'totalCheckins', 'target': 1}, {'habitId': 'h', 'metric': 'totalCheckins', 'target': 3}],
               'milestones': [{'id': 'm0', 'title': 'First', 'order': 0}, {'id': 'm', 'title': 'Middle', 'order': 1, 'date': '2026-10-29', 'isCompleted': True}, {'id': 'm2', 'title': 'Last', 'order': 2}]}],
    'habits': [{'id': 'h0', 'name': 'Other habit'}, {'id': 'h', 'name': 'Habit', 'areaId': 'a', 'goalIds': ['g0', 'g'], 'startDate': '2026-10-01', 'trackingType': 'numeric', 'targetValue': 3, 'frequencyType': 'daily', 'reminders': [{'id': 'r', 'time': '08:00', 'enabled': True}]}],
    'templates': [{'id': 'kit', 'type': 'task', 'name': 'Kit', 'data': {'title': 'Template source', 'subtasks': [{'id': 'draft-s', 'title': 'Nested'}], 'plannedOffsetDays': 3}}],
    'savedViews': [{'id': 'view', 'name': 'Focus view', 'type': 'tasks', 'isPinned': True, 'filters': {'tagId': 'tag', 'priority': 'none'}}],
}


def ready(page):
    page.wait_for_function('window.TodoApp && TodoApp.state')
    page.evaluate('()=>TodoApp.ready')


def route(page, value):
    page.evaluate('v=>location.hash="#"+v', value)
    page.wait_for_function('v=>location.hash==="#"+v', arg=value)
    page.evaluate('()=>new Promise(requestAnimationFrame)')


def click(page, action):
    page.locator('[data-action="' + action + '"]').first.click()


def trigger(page, kind):
    if kind in ['task', 'subtask', 'attachment']:
        route(page, 'project/p')
        page.locator('[data-action="open-task"][data-task-id="t"]').first.click()
        expect(page.locator('#detail-title')).to_be_visible()
        if kind == 'task':
            click(page, 'delete-task')
        elif kind == 'subtask':
            page.locator('[data-action="delete-subtask"][data-subtask-id="s"]').click()
        else:
            page.locator('[data-action="attachment-menu"][data-attachment-id="f"]').click()
            page.locator('[data-pop-action="attachment-delete"]').click()
    elif kind == 'milestone':
        route(page, 'goal/g')
        page.locator('[data-action="delete-milestone"][data-milestone-id="m"]').click()
    elif kind == 'template':
        route(page, 'templates')
        page.locator('[data-action="delete-template"][data-template-id="kit"]').click()
    elif kind == 'saved-view':
        route(page, 'saved-views')
        page.locator('[data-action="delete-saved-view"][data-saved-view-id="view"]').click()
    elif kind == 'clear-completed':
        route(page, 'settings')
        click(page, 'clear-completed')
    else:
        route(page, {'project': 'project/p', 'tag': 'tags', 'area': 'area/a', 'goal': 'goal/g', 'habit': 'habit/h'}[kind])
        page.locator('[data-action="' + kind + '-menu"]' + ('[data-tag-id="tag"]' if kind == 'tag' else '')).first.click()
        page.locator('[data-pop-action="delete-' + kind + '"]').click()


def domain(page):
    return page.evaluate('''async()=>({
      metadata:Object.fromEntries(['tasks','projects','tags','areas','goals','habits','templates','savedViews'].map(k=>[k,TodoApp.state[k]])),
      attachments:await Promise.all((await TodoStorage.attachments.listAll()).map(async r=>({...r,blob:await r.blob.text()}))),
      logs:await TodoStorage.habitLogs.listAll(),history:await TodoStorage.goalHistory.listAll()
    })''')


def differences(before, after, path=''):
    if isinstance(before, dict) and isinstance(after, dict):
        return [d for k in before.keys() | after.keys() for d in differences(before.get(k), after.get(k), path+'.'+k)]
    if isinstance(before, list) and isinstance(after, list) and len(before)==len(after):
        return [d for i,(a,b) in enumerate(zip(before,after)) for d in differences(a,b,path+'['+str(i)+']')]
    return [] if before==after else [(path,before,after)]


def undo(page):
    click(page, 'undo')
    page.wait_for_function('!document.querySelector("[data-action=undo]")')
    page.evaluate('()=>new Promise(requestAnimationFrame)')


def confirmed(page):
    expect(page.locator('.confirm-modal')).to_be_visible()
    click(page, 'confirm-action')
    page.wait_for_function('!!document.querySelector("[data-action=undo]") && !document.querySelector(".confirm-modal")')


def roundtrip(page, kind):
    before = domain(page)
    trigger(page, kind)
    expect(page.locator('.confirm-modal')).to_be_visible()
    assert domain(page) == before, kind + ': Delete mutated before confirmation'
    page.keyboard.press('Escape')
    assert domain(page) == before, kind + ': cancel changed domain'
    trigger(page, kind)
    confirmed(page)
    assert domain(page)['metadata'] != before['metadata'], kind + ': confirmed deletion absent'
    if kind in ['task', 'project', 'attachment', 'clear-completed']:
        records = domain(page)['attachments']
        assert {r['id']: r['blob'] for r in records} == {'f': 'first\x00bytes', 'f2': 'second bytes', 'fd': 'completed bytes'}
        assert any(r['pendingDeleteUntil'] for r in records), 'Blob not pending'
    undo(page)
    assert domain(page) == before, kind + ': full relevant snapshot/order/bytes not restored'
    page.reload(); ready(page)
    assert domain(page) == before, kind + ': restored domain not durable '+str(differences(before,domain(page))[:8])


def displacement(page):
    trigger(page, 'task'); confirmed(page)
    until = page.evaluate('(async()=> (await TodoAttachments.get("f")).pendingDeleteUntil)()')
    page.clock.run_for(1000)
    route(page, 'goal/g'); click(page, 'goal-menu'); page.locator('[data-pop-action="delete-goal"]').click(); confirmed(page)
    assert page.evaluate('(async()=> (await TodoAttachments.get("f")).blob.text())()') == 'first\x00bytes', 'displaced Undo deleted Blob early'
    remaining = page.evaluate('until=>new Date(until).getTime()-Date.now()', until)
    page.clock.run_for(max(0, remaining-500))
    assert page.evaluate('(async()=> (await TodoAttachments.get("f")).pendingDeleteUntil)()') == until
    page.clock.run_for(1000)
    page.wait_for_function('async()=>!(await TodoAttachments.get("f"))')
    assert page.evaluate('async()=>!!(await TodoAttachments.get("fd"))')
    undo(page)
    assert page.evaluate('TodoApp.state.goals.some(g=>g.id==="g")')


def stale(page, kind):
    trigger(page, kind)
    before = domain(page)
    page.evaluate('''kind=>{const collections={task:'tasks',project:'projects',tag:'tags',area:'areas',goal:'goals',habit:'habits',template:'templates','saved-view':'savedViews'};
      const ids={task:'t',project:'p',tag:'tag',area:'a',goal:'g',habit:'h',template:'kit','saved-view':'view'};
      if(collections[kind]){const a=TodoApp.state[collections[kind]],i=a.findIndex(e=>e.id===ids[kind]);a[i]={...a[i]};}
      else if(kind==='subtask')TodoApp.state.tasks.find(t=>t.id==='t').subtasks[1]={...TodoApp.state.tasks.find(t=>t.id==='t').subtasks[1]};
      else if(kind==='milestone')TodoApp.state.goals.find(g=>g.id==='g').milestones[1]={...TodoApp.state.goals.find(g=>g.id==='g').milestones[1]};
      else if(kind==='attachment'){TodoApp.state.tasks.find(t=>t.id==='t').attachmentIds=[];TodoApp.state.tasks[0].attachmentIds=['f','f2'];}
    }''', kind)
    expected = domain(page)
    click(page, 'confirm-action')
    page.wait_for_function('!document.querySelector(".confirm-modal")')
    assert domain(page) == expected, kind + ': stale confirmation acted on replacement/source owner'
    assert page.locator('[data-action="undo"]').count() == 0
    assert page.locator('#toast-root').inner_text(), 'stale context failure not reported'


def precise_inverse(page, kind):
    trigger(page, kind); confirmed(page)
    page.evaluate('''kind=>{
      const s=TodoApp.state;
      if(kind==='tag'){s.tasks.find(t=>t.id==='t').tagIds.push('later-tag');s.tasks.find(t=>t.id==='t').notes='Later edit';s.tags.push({id:'later-tag',name:'Later'});}
      if(kind==='area')s.tasks.find(t=>t.id==='standalone').areaId='later-area';
      if(kind==='habit'){s.goals.find(g=>g.id==='g').habitLinks.push({habitId:'later-habit',metric:'totalCheckins',target:99});s.goals.find(g=>g.id==='g0').title='Later goal edit';}
      if(kind==='goal')s.tasks.find(t=>t.id==='t').goalIds.push('later-goal');
      if(kind==='subtask')s.tasks.find(t=>t.id==='t').subtasks[0].title='Later sibling edit';
      if(kind==='milestone')s.goals.find(g=>g.id==='g').milestones[0].title='Later milestone edit';
      if(kind==='task')s.goals.find(g=>g.id==='g').taskIds.push('standalone');
    }''', kind)
    undo(page)
    s = domain(page)['metadata']
    t = next(t for t in s['tasks'] if t['id'] == 't')
    g = next(g for g in s['goals'] if g['id'] == 'g')
    if kind == 'tag': assert t['tagIds'] == ['other-tag', 'tag', 'later-tag'] and t['notes'] == 'Later edit'
    if kind == 'area': assert next(t for t in s['tasks'] if t['id'] == 'standalone')['areaId'] == 'later-area'
    if kind == 'habit': assert [h['habitId'] for h in g['habitLinks']] == ['h0', 'h', 'later-habit'] and s['goals'][0]['title'] == 'Later goal edit'
    if kind == 'goal': assert t['goalIds'] == ['g0', 'g', 'later-goal']
    if kind == 'subtask': assert t['subtasks'][0]['title'] == 'Later sibling edit' and [x['id'] for x in t['subtasks']] == ['s0','s','s2']
    if kind == 'milestone': assert g['milestones'][0]['title'] == 'Later milestone edit'
    if kind == 'task': assert g['taskIds'] == ['t0', 't', 'done', 'standalone']


def fault(page, kind, method):
    before = domain(page)
    trigger(page, kind)
    page.evaluate('''method=>{
      const target=method==='markPending'?TodoAttachments:method==='habitLogs'?TodoStorage.habitLogs:TodoStorage.goalHistory;
      const key=method==='markPending'?method:'deleteMany';const original=target[key];
      window.__restoreFault=()=>{target[key]=original;};
      target[key]=async(...a)=>{await original.apply(target,a);throw Error('Injected partial native write failure');};
    }''', method)
    click(page, 'confirm-action')
    page.wait_for_function('!document.querySelector(".confirm-modal")')
    assert domain(page) == before, kind + ': native failure lost data or mutated metadata'
    assert page.locator('[data-action="undo"]').count() == 0
    assert page.locator('#toast-root').inner_text()
    page.evaluate('__restoreFault()')
    trigger(page, kind); confirmed(page); undo(page)
    assert domain(page) == before


def undo_retry(page):
    before = domain(page); trigger(page, 'habit'); confirmed(page)
    page.evaluate('''()=>{let restore=TodoStorage.restoreDeleteRecords;window.__restoreFault=()=>{TodoStorage.restoreDeleteRecords=restore;};TodoStorage.restoreDeleteRecords=async()=>{throw Error('Injected Undo write failure');};}''')
    click(page, 'undo')
    page.wait_for_function('document.querySelector("#toast-root").textContent.includes("failed")')
    assert page.locator('[data-action="undo"]').count() == 1, 'failed Undo consumed recovery'
    assert not page.evaluate('TodoApp.state.habits.some(h=>h.id==="h")')
    page.evaluate('__restoreFault()'); undo(page)
    assert domain(page) == before


def lifecycle(page, mode):
    trigger(page, 'task'); confirmed(page)
    page.evaluate('async()=>{window.__hold=await TodoApp.deleteLifecycle.hold()}')
    assert page.locator('[data-action="undo"]').count() == 0
    if mode == 'resume':
        page.clock.run_for(1000); page.evaluate('TodoApp.deleteLifecycle.resume(__hold)')
        undo(page)
        assert page.evaluate('TodoApp.state.tasks.some(t=>t.id==="t")')
    elif mode == 'expired-resume':
        page.clock.run_for(6501)
        assert page.evaluate('async()=>!!(await TodoAttachments.get("f"))'), 'held cleanup ran'
        page.evaluate('TodoApp.deleteLifecycle.resume(__hold)')
        page.wait_for_function('async()=>!(await TodoAttachments.get("f"))')
        assert page.locator('[data-action="undo"]').count() == 0
    else:
        page.evaluate('''async()=>{await TodoAttachments.put({id:'f',taskId:'t',blob:new Blob(['incoming']),size:8,pendingDeleteUntil:null});TodoApp.state.tasks.push({id:'t',title:'Incoming',attachmentIds:['f']});TodoApp.deleteLifecycle.retire(__hold);}''')
        page.clock.run_for(7000)
        assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()') == 'incoming'
        assert page.locator('[data-action="undo"]').count() == 0


def wall_jump(page, direction):
    before=domain(page);trigger(page,'task');confirmed(page)
    page.clock.set_system_time('2026-10-24T15:00:00+02:00' if direction=='forward' else '2026-10-24T09:00:00+02:00')
    page.clock.run_for(3100)
    assert page.evaluate('async()=>!!(await TodoAttachments.get("f"))'), 'wall clock edit shortened Blob protection'
    undo(page)
    assert domain(page)==before, 'wall clock edit shortened normal6500ms Undo eligibility'


def reconstructed_resume(page, expired=False):
    trigger(page,'task');confirmed(page)
    page.evaluate('async()=>{window.__hold=await TodoApp.deleteLifecycle.hold();window.__restored=JSON.parse(localStorage.getItem("todoAppData"));}')
    # Exercise the actual hydration queue, not preservation of JavaScript object identities.
    page.evaluate('''()=>{const raw=JSON.stringify(__restored);localStorage.setItem('todoAppData',raw);window.dispatchEvent(new StorageEvent('storage',{key:'todoAppData',newValue:raw}));}''')
    ready(page)
    if expired: page.clock.run_for(6501)
    page.evaluate('TodoApp.deleteLifecycle.resume(__hold)')
    if expired:
        page.wait_for_function('async()=>!(await TodoAttachments.get("f"))')
        assert page.locator('[data-action="undo"]').count()==0
    else:
        undo(page)
        assert page.evaluate('TodoApp.state.tasks.some(t=>t.id==="t")')
        assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='first\x00bytes'


def reject_reused_pending(page):
    trigger(page,'task');confirmed(page)
    page.evaluate('''async()=>{window.__hold=await TodoApp.deleteLifecycle.hold();const r=await TodoAttachments.get('f');await TodoAttachments.put({...r,blob:new Blob(['other\\x00bytes'])});}''')
    rejected=page.evaluate('''async()=>{try{await TodoApp.deleteLifecycle.resume(__hold);return false;}catch(_){return true;}}''')
    assert rejected, 'ID/deadline/token-only resume accepted different same-sized bytes'
    page.evaluate('TodoApp.deleteLifecycle.retire(__hold)');page.clock.run_for(7000)
    assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='other\x00bytes'


def finalizer_failure(page):
    trigger(page,'task');confirmed(page)
    page.evaluate('''()=>{const original=TodoAttachments.deletePending;window.__restoreFault=()=>{TodoAttachments.deletePending=original;};TodoAttachments.deletePending=async()=>{throw Error('Injected finalizer failure');};}''')
    page.clock.run_for(6501)
    page.wait_for_function('document.querySelector("#toast-root").textContent.includes("cleanup failed")')
    assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='first\x00bytes'
    page.evaluate('__restoreFault()');page.clock.run_for(30001)
    page.wait_for_function('async()=>!(await TodoAttachments.get("f"))')
    assert page.evaluate('async()=>!!(await TodoAttachments.get("fd"))')


def inflight_hold(page, action):
    trigger(page,'habit' if action=='undo' else 'task');confirmed(page)
    page.evaluate('''action=>{const target=action==='undo'?TodoStorage:TodoAttachments,key=action==='undo'?'restoreDeleteRecords':'deletePending',original=target[key];
      window.__started=false;window.__released=false;window.__holdReady=false;let waiting=true;
      target[key]=async(...args)=>{if(waiting){waiting=false;__started=true;await new Promise(resolve=>{window.__release=resolve;});__released=true;}return original.apply(target,args);};
    }''',action)
    if action=='undo': click(page,'undo')
    else: page.clock.run_for(6501)
    page.wait_for_function('__started')
    page.evaluate('''()=>{window.__holdPromise=TodoApp.deleteLifecycle.hold().then(token=>{window.__hold=token;__holdReady=true;});}''')
    assert not page.evaluate('__holdReady'), 'hold returned before owned native work settled'
    page.evaluate('__release()');page.wait_for_function('__holdReady')
    assert page.evaluate('__released')
    if action=='undo': assert page.evaluate('TodoApp.state.habits.some(h=>h.id==="h")')
    else: assert page.evaluate('async()=>!(await TodoAttachments.get("f"))')
    page.evaluate('TodoApp.deleteLifecycle.retire(__hold)')


def nondelete_retire(page, kind):
    route(page,'project/p')
    if kind=='completion':
        page.evaluate('''()=>{const t=TodoApp.state.tasks.find(t=>t.id==='t');t.recurrence.status='active';t.recurrenceSuccessorId=null;}''')
        page.locator('[data-action="toggle-complete"][data-task-id="t"]').first.click()
    elif kind=='duplicate':
        page.locator('[data-action="task-menu"][data-task-id="t"]').click();page.locator('[data-pop-action="task-duplicate"]').click();click(page,'duplicate-without-files')
    else:
        route(page,'templates');click(page,'edit-template');click(page,'template-remove-row');confirmed(page);click(page,'save-template')
    page.wait_for_function('!!document.querySelector("[data-action=undo]")')
    page.evaluate('window.__staleUndo=document.querySelector("[data-action=undo]")')
    page.evaluate('async()=>{window.__hold=await TodoApp.deleteLifecycle.hold()}')
    page.evaluate('''()=>{for(const k of ['tasks','templates'])TodoApp.state[k]=TodoApp.state[k].map(e=>({...e,...(k==='tasks'?{title:'Incoming '+e.id}:{name:'Incoming '+e.id})}));}''')
    before=domain(page)
    page.evaluate('TodoApp.deleteLifecycle.retire(__hold);__staleUndo.click()');page.clock.run_for(7000)
    assert page.locator('[data-action="undo"]').count()==0
    assert domain(page)==before, kind+': retired normal Undo altered incoming IDs'


def atomic_undo_fault(page):
    before=domain(page);trigger(page,'habit');confirmed(page)
    page.evaluate('''()=>{const original=TodoStorage.restoreDeleteRecords;window.__restoreFault=()=>{TodoStorage.restoreDeleteRecords=original;};
      TodoStorage.restoreDeleteRecords=s=>{const bad=structuredClone(s);bad.habitLogs[1].date=bad.habitLogs[0].date;return original(bad);};}''')
    click(page,'undo');page.wait_for_function('document.querySelector("#toast-root").textContent.includes("Undo failed")')
    assert page.evaluate('async()=>(await TodoStorage.habitLogs.listByHabit("h")).length')==0, 'native abort left first partial log'
    assert not page.evaluate('TodoApp.state.habits.some(h=>h.id==="h")')
    assert page.locator('[data-action="undo"]').count()==1
    page.evaluate('__restoreFault()');undo(page);assert domain(page)==before


def conditional_blob_race(page):
    trigger(page,'task');confirmed(page)
    page.evaluate('''()=>{const original=TodoAttachments.deletePending;let injected=false;
      TodoAttachments.deletePending=async(records,now)=>{if(!injected){injected=true;const r=await TodoAttachments.get('f');await TodoAttachments.put({...r,blob:new Blob(['other\\x00bytes'],{type:r.blob.type})});}return original(records,now);};}''')
    page.clock.run_for(6501)
    page.wait_for_function('async()=>!(await TodoAttachments.get("f2"))')
    assert page.evaluate('async()=>(await TodoAttachments.get("f"))?.blob.text()')=='other\x00bytes', 'metadata-only conditional cleanup deleted reused same-size Blob bytes'


def blob_read_abort(page):
    trigger(page,'task');confirmed(page)
    page.evaluate('''()=>{const original=TodoAttachments.deletePending,read=Blob.prototype.arrayBuffer;
      window.__restoreFault=()=>{TodoAttachments.deletePending=original;Blob.prototype.arrayBuffer=read;};
      TodoAttachments.deletePending=(...args)=>{Blob.prototype.arrayBuffer=async()=>{throw Error('Injected held-transaction Blob read failure');};return original(...args);};}''')
    page.clock.run_for(6501)
    page.wait_for_function('document.querySelector("#toast-root").textContent.includes("cleanup failed")')
    assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='first\x00bytes'
    page.evaluate('__restoreFault()');page.clock.run_for(30001)
    page.wait_for_function('async()=>!(await TodoAttachments.get("f"))')
    assert page.evaluate('async()=>!!(await TodoAttachments.get("fd"))')


def unused_roundtrip(page, kind):
    page.evaluate('''kind=>{if(kind==='project')for(const t of TodoApp.state.tasks){if(t.projectId==='p')t.projectId=null;}else for(const t of TodoApp.state.tasks)t.tagIds=(t.tagIds||[]).filter(id=>id!=='tag');}''',kind)
    before=domain(page);trigger(page,kind);expect(page.locator('.confirm-modal')).to_be_visible()
    assert domain(page)==before
    page.keyboard.press('Escape');assert domain(page)==before
    trigger(page,kind);confirmed(page);undo(page);assert domain(page)==before


def repeated_undo(page, expired=False):
    before=domain(page);trigger(page,'task');confirmed(page)
    page.evaluate('window.__staleUndo=document.querySelector("[data-action=undo]")')
    if expired:
        page.clock.run_for(6501);page.wait_for_function('async()=>!(await TodoAttachments.get("f"))')
        expected=domain(page)
    else:
        undo(page);expected=before
    page.evaluate('__staleUndo.click();__staleUndo.click()')
    assert domain(page)==expected, 'double/expired Undo acted twice or resurrected expired entity'


def task_menu_roundtrip(page):
    before=domain(page);route(page,'project/p')
    page.locator('[data-action="task-menu"][data-task-id="t"]').click();page.locator('[data-pop-action="task-delete"]').click()
    expect(page.locator('.confirm-modal')).to_be_visible();assert domain(page)==before
    page.keyboard.press('Escape');assert domain(page)==before
    page.locator('[data-action="task-menu"][data-task-id="t"]').click();page.locator('[data-pop-action="task-delete"]').click();confirmed(page);undo(page);assert domain(page)==before


def delete_during_hold(page):
    trigger(page,'task');confirmed(page)
    page.evaluate('async()=>{window.__hold=await TodoApp.deleteLifecycle.hold()}')
    before=domain(page)
    trigger(page,'goal')
    assert page.locator('.confirm-modal').count()==0
    assert domain(page)==before
    page.evaluate('TodoApp.deleteLifecycle.resume(__hold)');undo(page)


def failed_hold(page):
    trigger(page,'task');confirmed(page)
    page.evaluate('''()=>{const get=TodoAttachments.get;window.__restoreFault=()=>{TodoAttachments.get=get;};TodoAttachments.get=async()=>{throw Error('Injected hold ownership-read failure');};}''')
    rejected=page.evaluate('''async()=>{try{await TodoApp.deleteLifecycle.hold();return false;}catch(_){return true;}}''')
    assert rejected
    assert page.locator('[data-action="undo"]').count()==1, 'failed hold trapped normal Undo without an accessible token'
    page.evaluate('__restoreFault()');undo(page)
    assert page.evaluate('TodoApp.state.tasks.some(t=>t.id==="t")')


def undo_blob_race(page):
    trigger(page,'task');confirmed(page)
    page.evaluate('''()=>{const original=TodoStorage.restoreDeleteRecords;let injected=false;
      TodoStorage.restoreDeleteRecords=async(...args)=>{if(!injected){injected=true;const r=await TodoAttachments.get('f');await TodoAttachments.put({...r,blob:new Blob(['other\\x00bytes'],{type:r.blob.type})});}return original(...args);};}''')
    click(page,'undo')
    page.wait_for_function('!document.querySelector("[data-action=undo]") || document.querySelector("#toast-root").textContent.includes("Undo failed")')
    assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='other\x00bytes', 'Undo precheck/write race overwrote reused Blob bytes'
    assert not page.evaluate('TodoApp.state.tasks.some(t=>t.id==="t")')
    assert page.locator('[data-action="undo"]').count()==1


def changed_during_prepare(page):
    trigger(page,'task')
    page.evaluate('''()=>{const get=TodoAttachments.getMany;let waiting=true;window.__started=false;
      TodoAttachments.getMany=async(...args)=>{const records=await get(...args);if(waiting){waiting=false;__started=true;await new Promise(resolve=>{window.__release=resolve;});}return records;};}''')
    click(page,'confirm-action');page.wait_for_function('__started')
    page.evaluate('TodoApp.state.tasks.find(t=>t.id==="t").notes="Concurrent edit"')
    expected=domain(page);page.evaluate('__release()')
    page.wait_for_function('!document.querySelector(".confirm-modal")')
    assert domain(page)==expected, 'async preparation deleted a changed entity using a stale deep snapshot'
    assert page.locator('[data-action="undo"]').count()==0


def rollback_failure(page, incoming=False, kind='task'):
    before=domain(page);trigger(page,kind)
    page.evaluate('''kind=>{const target=kind==='task'?TodoAttachments:kind==='habit'?TodoStorage.habitLogs:TodoStorage.goalHistory,key=kind==='task'?'markPending':'deleteMany',prep=target[key],restore=TodoStorage.restoreDeleteRecords;
      window.__restoreFault=()=>{target[key]=prep;TodoStorage.restoreDeleteRecords=restore;};
      target[key]=async(...args)=>{await prep(...args);throw Error('Original partial native prep failure');};
      TodoStorage.restoreDeleteRecords=async()=>{throw Error('Rollback unavailable');};}''',kind)
    click(page,'confirm-action');page.wait_for_function('!document.querySelector(".confirm-modal")')
    assert domain(page)['metadata']==before['metadata']
    assert page.locator('[data-action="undo"]').count()==0
    expect(page.locator('[data-action="retry-delete-recovery"]')).to_be_visible()
    assert 'Original partial native prep failure' in page.locator('#toast-root').inner_text()
    assert 'Rollback unavailable' in page.locator('#toast-root').inner_text()
    page.clock.run_for(7000)
    assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='first\x00bytes'
    rejected=page.evaluate('''async()=>{try{await TodoApp.deleteLifecycle.hold();return false;}catch(_){return true;}}''')
    assert rejected, 'unresolved partial preparation was allowed into global capture'
    page.evaluate('__restoreFault()')
    if incoming:
        page.evaluate('''async()=>{const r=await TodoAttachments.get('f');await TodoAttachments.put({...r,blob:new Blob(['other\\x00bytes'])});}''')
        click(page,'retry-delete-recovery')
        page.wait_for_function('document.querySelector("#toast-root").textContent.includes("ownership changed")')
        assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='other\x00bytes'
    else:
        click(page,'retry-delete-recovery');page.wait_for_function('!document.querySelector("[data-action=retry-delete-recovery]")')
        assert domain(page)==before
        page.reload();ready(page);assert domain(page)==before


def prep_blob_race(page):
    before=domain(page);trigger(page,'task')
    page.evaluate('''()=>{const mark=TodoAttachments.markPending;
      TodoAttachments.markPending=async(...args)=>{const r=await TodoAttachments.get('f');await TodoAttachments.put({...r,blob:new Blob(['other\\x00bytes'])});return mark(...args);};}''')
    click(page,'confirm-action');page.wait_for_function('!document.querySelector(".confirm-modal")')
    assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='other\x00bytes', 'failed native prep rollback overwrote incoming bytes'
    assert domain(page)['metadata']==before['metadata'], 'native prep deleted metadata after file ownership changed'
    assert page.locator('[data-action="undo"]').count()==0


def preparation_does_not_consume_undo(page):
    trigger(page,'task')
    page.evaluate('''()=>{const get=TodoAttachments.getMany;let waiting=true;window.__started=false;
      TodoAttachments.getMany=async(...args)=>{const records=await get(...args);if(waiting){waiting=false;__started=true;await new Promise(resolve=>{window.__release=resolve;});}return records;};}''')
    click(page,'confirm-action');page.wait_for_function('__started');page.clock.run_for(1000);page.evaluate('__release()')
    page.wait_for_function('!!document.querySelector("[data-action=undo]")')
    page.clock.run_for(5600)
    assert page.locator('[data-action="undo"]').count()==1, 'native preparation consumed the normal6500ms visible Undo window'
    undo(page)


def pending_blob_changed(page):
    before=domain(page);trigger(page,'task')
    page.evaluate('''()=>{const mark=TodoAttachments.markPending;
      TodoAttachments.markPending=async(...args)=>{await mark(...args);const r=await TodoAttachments.get('f');await TodoAttachments.put({...r,blob:new Blob(['other\\x00bytes'])});};}''')
    click(page,'confirm-action');page.wait_for_function('!document.querySelector(".confirm-modal")')
    assert domain(page)['metadata']==before['metadata'], 'changed prepared Blob was accepted as owned deletion snapshot'
    assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='other\x00bytes'
    assert page.locator('[data-action="undo"]').count()==0


def inflight_status_history(page, kind='goal'):
    route(page,'goal/g' if kind=='goal' else 'habit/h')
    if kind=='habit': click(page,'habit-menu');page.locator('[data-pop-action="pause-habit"]').click()
    else: click(page,'pause-goal')
    page.wait_for_function('!!document.querySelector("[data-action=undo]")')
    page.evaluate('''kind=>{const target=kind==='goal'?TodoStorage.goalHistory:TodoStorage.habitLogs,key=kind==='goal'?'put':'listAll',original=target[key];window.__started=false;window.__holdReady=false;
      target[key]=async(...args)=>{__started=true;await new Promise(resolve=>{window.__release=resolve;});return original.apply(target,args);};}''',kind)
    click(page,'undo');page.wait_for_function('__started')
    page.evaluate('''()=>{window.__holdPromise=TodoApp.deleteLifecycle.hold().then(token=>{window.__hold=token;__holdReady=true;});}''')
    settled=page.evaluate('__holdReady');page.evaluate('__release()')
    assert not settled, 'hold missed detached native '+kind+'-status Undo work'
    page.wait_for_function('__holdReady');page.evaluate('TodoApp.deleteLifecycle.retire(__hold)')


def changed_project_scope(page):
    trigger(page,'project')
    page.evaluate('''()=>{const get=TodoAttachments.getMany;let waiting=true;window.__started=false;
      TodoAttachments.getMany=async(...args)=>{const records=await get(...args);if(waiting){waiting=false;__started=true;await new Promise(resolve=>{window.__release=resolve;});}return records;};}''')
    click(page,'confirm-action');page.wait_for_function('__started')
    page.evaluate('TodoApp.state.tasks.push({id:"late",title:"Intervening task",projectId:"p",attachmentIds:[]})')
    expected=domain(page);page.evaluate('__release()');page.wait_for_function('!document.querySelector(".confirm-modal")')
    assert domain(page)==expected, 'project preparation deleted a changed subtree scope and left an orphan'
    assert page.locator('[data-action="undo"]').count()==0


def undo_metadata_boundary(page, boundary):
    kind='subtask' if boundary=='parent' else 'task'
    trigger(page,kind);confirmed(page)
    pending=domain(page)
    if boundary=='during-native':
        page.evaluate('''()=>{const read=Blob.prototype.arrayBuffer;let calls=0;window.__started=false;
          Blob.prototype.arrayBuffer=async function(){if(++calls===5){__started=true;await new Promise(resolve=>{window.__release=resolve;});}return read.call(this);};}''')
    else:
        install_undo_boundary(page,boundary)
    click(page,'undo');page.wait_for_function('__started')
    if boundary=='project-parent':
        page.evaluate('''()=>{const i=TodoApp.state.projects.findIndex(p=>p.id==='p');TodoApp.state.projects[i]=JSON.parse(JSON.stringify(TodoApp.state.projects[i]));TodoApp.state.projects[i].name='Incoming project parent';}''')
    elif boundary=='parent':
        page.evaluate('''()=>{const i=TodoApp.state.tasks.findIndex(t=>t.id==='t');TodoApp.state.tasks[i]=JSON.parse(JSON.stringify(TodoApp.state.tasks[i]));TodoApp.state.tasks[i].notes='Incoming parent';}''')
    elif boundary in ['before-native','after-native']:
        page.evaluate('''async boundary=>{const s=JSON.parse(localStorage.getItem('todoAppData'));s.tasks.push({id:'t',title:'Incoming task',notes:'Do not change',subtasks:[],attachmentIds:[],goalIds:[],tagIds:[],isCompleted:false,isInbox:true});
          const raw=JSON.stringify(s);localStorage.setItem('todoAppData',raw);window.dispatchEvent(new StorageEvent('storage',{key:'todoAppData',newValue:raw}));
          if(boundary==='after-native'){const r=await TodoAttachments.get('f');await TodoAttachments.put({...r,blob:new Blob(['other\\x00bytes'],{type:r.blob.type})});}}''',boundary)
        ready(page)
    else:
        page.evaluate('TodoApp.state.tasks.push({id:"t",title:"Occupied ID",subtasks:[],attachmentIds:[]})')
    if boundary=='during-native':
        expected=pending
        expected['metadata']=page.evaluate("Object.fromEntries(['tasks','projects','tags','areas','goals','habits','templates','savedViews'].map(k=>[k,TodoApp.state[k]]))")
    else: expected=domain(page)
    page.evaluate('__release()')
    page.wait_for_function('!document.querySelector("[data-action=undo]") || document.querySelector("#toast-root").textContent.includes("Undo failed")')
    assert domain(page)==expected, 'Undo '+boundary+' boundary mutated changed metadata/source or native ownership'


def install_undo_boundary(page,boundary):
    page.evaluate('''boundary=>{const target=boundary==='read'?TodoAttachments:TodoStorage,key=boundary==='read'?'get':'restoreDeleteRecords',original=target[key];let waiting=true;window.__started=false;
      target[key]=async(...args)=>{if(!waiting)return original.apply(target,args);waiting=false;
        const result=boundary==='after-native'?await original.apply(target,args):undefined;
        __started=true;await new Promise(resolve=>{window.__release=resolve;});
        return boundary==='after-native'?result:original.apply(target,args);};}''',boundary)


def undo_compensation_failure(page, replacement=False):
    before=domain(page);trigger(page,'task');confirmed(page)
    page.evaluate('''replacement=>{const restore=TodoStorage.restoreDeleteRecords,set=Storage.prototype.setItem;let calls=0;
      window.__restoreFault=()=>{TodoStorage.restoreDeleteRecords=restore;Storage.prototype.setItem=set;};
      Storage.prototype.setItem=function(key,value){if(key==='todoAppData')throw Error('Injected Undo metadata persistence failure');return set.call(this,key,value);};
      TodoStorage.restoreDeleteRecords=async(...args)=>{calls++;if(calls===2){
        if(!replacement)throw Error('Undo compensation unavailable');
        const r=await TodoAttachments.get('f');await TodoAttachments.put({...r,blob:new Blob(['other\\x00bytes'],{type:r.blob.type})});
      }return restore(...args);};}''',replacement)
    click(page,'undo');page.wait_for_function('document.querySelector("#toast-root").textContent.includes("Undo failed")')
    if replacement:
        assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='other\x00bytes', 'Undo compensation overwrote same-metadata different-byte replacement'
    expect(page.locator('[data-action="retry-delete-recovery"]')).to_be_visible()
    assert 'Local metadata could not be saved' in page.locator('#toast-root').inner_text()
    if not replacement: assert 'Undo compensation unavailable' in page.locator('#toast-root').inner_text()
    assert not page.evaluate('TodoApp.state.tasks.some(t=>t.id==="t")')
    rejected=page.evaluate('''async()=>{try{await TodoApp.deleteLifecycle.hold();return false;}catch(_){return true;}}''')
    assert rejected, 'partial failed Undo was allowed into global capture'
    page.clock.run_for(7000);page.evaluate('__restoreFault()')
    click(page,'retry-delete-recovery')
    if replacement:
        page.wait_for_function('document.querySelector("#toast-root").textContent.includes("ownership changed")')
        assert page.evaluate('async()=>(await TodoAttachments.get("f")).blob.text()')=='other\x00bytes'
        assert not page.evaluate('TodoApp.state.tasks.some(t=>t.id==="t")')
    else:
        page.wait_for_function('!document.querySelector("[data-action=retry-delete-recovery]")')
        assert domain(page)==before, 'phase-aware Undo recovery failed to restore exact native originals/metadata'
        page.evaluate('async()=>{const token=await TodoApp.deleteLifecycle.hold();TodoApp.deleteLifecycle.retire(token);}')
        page.reload();ready(page);assert domain(page)==before


def undo_failure_crosses_deadline(page):
    before=domain(page);trigger(page,'habit');confirmed(page)
    page.evaluate('''()=>{const restore=TodoStorage.restoreDeleteRecords;window.__started=false;window.__restoreFault=()=>{TodoStorage.restoreDeleteRecords=restore;};
      TodoStorage.restoreDeleteRecords=async()=>{__started=true;await new Promise(resolve=>{window.__release=resolve;});throw Error('Accepted Undo native write unavailable');};}''')
    click(page,'undo');page.wait_for_function('__started')
    page.evaluate('''()=>{window.__holdSettled=false;window.__holdRejected=false;TodoApp.deleteLifecycle.hold().then(()=>{__holdSettled=true;},()=>{__holdRejected=true;__holdSettled=true;});}''')
    assert not page.evaluate('__holdSettled')
    page.clock.run_for(6501);page.evaluate('__release()');page.wait_for_function('__holdSettled')
    assert page.evaluate('__holdRejected'), 'failed accepted Undo crossing deadline did not block global hold'
    assert page.locator('[data-action="undo"]').count()==0, 'expired normal Undo was renewed'
    expect(page.locator('[data-action="retry-delete-recovery"]')).to_be_visible()
    page.evaluate('__restoreFault()');click(page,'retry-delete-recovery')
    page.wait_for_function('!document.querySelector("[data-action=retry-delete-recovery]")')
    assert domain(page)==before, 'failed accepted Undo lost native Habit logs after original deadline'


def undo_failure_before_deadline(page):
    before=domain(page);trigger(page,'habit');confirmed(page)
    page.clock.run_for(6000)
    page.evaluate('''()=>{const restore=TodoStorage.restoreDeleteRecords;window.__restoreFault=()=>{TodoStorage.restoreDeleteRecords=restore;};TodoStorage.restoreDeleteRecords=async()=>{throw Error('Accepted Undo write unavailable before expiry');};}''')
    click(page,'undo');page.wait_for_function('document.querySelector("#toast-root").textContent.includes("Undo failed")')
    assert page.locator('[data-action="undo"]').count()==1
    assert page.evaluate('''async()=>{try{await TodoApp.deleteLifecycle.hold();return false;}catch(_){return true;}}'''), 'failed accepted Undo recovery escaped hold while still eligible'
    page.clock.run_for(501)
    assert page.locator('[data-action="undo"]').count()==0
    expect(page.locator('[data-action="retry-delete-recovery"]')).to_be_visible()
    assert page.evaluate('''async()=>{try{await TodoApp.deleteLifecycle.hold();return false;}catch(_){return true;}}''')
    page.evaluate('__restoreFault()');click(page,'retry-delete-recovery')
    page.wait_for_function('!document.querySelector("[data-action=retry-delete-recovery]")')
    assert domain(page)==before, 'previous failed accepted Undo was discarded at original expiry'


def global_domain(page):
    return page.evaluate('''async()=>({raw:localStorage.getItem('todoAppData'),
      attachments:await Promise.all((await TodoStorage.attachments.listAll()).map(async r=>({...r,blob:{type:r.blob.type,size:r.blob.size,bytes:[...new Uint8Array(await r.blob.arrayBuffer())]}}))),
      habitLogs:await TodoStorage.habitLogs.listAll(),goalHistory:await TodoStorage.goalHistory.listAll()})''')


def global_settled(page):
    page.evaluate('''async()=>{const end=performance.now()+3500;while((await TodoStorage.recoverySnapshots.listAll()).length){if(performance.now()>end)throw Error('Recovery snapshot did not settle');await new Promise(requestAnimationFrame);}}''')


def global_safety(page, mode='reset', fault=None):
    import json, zipfile
    route(page,'settings')
    page.evaluate('''async()=>{const records=await TodoStorage.attachments.listAll();await new Promise((resolve,reject)=>{const r=indexedDB.open('todoAppAttachments',1);r.onupgradeneeded=()=>r.result.createObjectStore('attachments',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('attachments','readwrite');records.forEach(record=>tx.objectStore('attachments').put(record));tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});}''')
    page.evaluate('''async()=>{await TodoStorage.attachments.put({id:'physical-orphan',taskId:'deleted',fileName:'orphan.bin',mimeType:'',size:3,blob:new Blob([new Uint8Array([255,0,97])]),pendingDeleteUntil:'2030-01-01T00:00:00Z'});
      window.events=[];
      for(const [object,key,event] of [[TodoBackup,'exportBackupV3','export'],[TodoStorage,'createRecoverySnapshot','snapshot'],[TodoBackup,'inspectBackupV3','inspect'],[TodoStorage,'replaceAllValidatedBackup','replace'],[TodoStorage,'restoreRecoverySnapshot','rollback'],[TodoStorage.recoverySnapshots,'deleteMany','cleanup']]){const fn=object[key];object[key]=async function(...args){events.push(event);if(['replace','rollback'].includes(event)&&!(await TodoStorage.recoverySnapshots.listAll()).length)throw Error('recovery removed before '+event);return fn.apply(this,args);};}
      const capture=TodoStorage.captureUserData;TodoStorage.captureUserData=async()=>{if(events.includes('replace')&&!events.includes('verify')&&!events.includes('rollback')){events.push('verify');if(!(await TodoStorage.recoverySnapshots.listAll()).length)throw Error('snapshot absent during verification');}return capture();};
      const native=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.zip'))events.push('download');return native.call(this);};
    }''')
    before=global_domain(page)
    incoming=None
    if mode=='restore':
        incoming=bytes(page.evaluate('''async()=>{const s=JSON.parse(JSON.stringify(TodoApp.state));s.tasks[0].title='Incoming title';const b=await TodoBackup.exportBackupV3(s,TodoStorage,'2026-10-24T10:00:00Z');events=[];return [...new Uint8Array(await b.arrayBuffer())];}'''))
    if fault=='replace':
        page.evaluate('''()=>{const native=TodoStorage.replaceAllValidatedBackup;let once=true;TodoStorage.replaceAllValidatedBackup=async(...args)=>{await native(...args);if(once){once=false;throw Error('forced replacement failure');}};}''')
    with page.expect_download() as downloaded:
        if mode=='reset': click(page,'reset-app')
        else: page.set_input_files('#backup-import-input',{'name':'incoming.zip','mimeType':'application/zip','buffer':incoming})
    download=downloaded.value
    with zipfile.ZipFile(download.path()) as archive:
        manifest=json.loads(archive.read('data.json'))
        assert manifest['backupVersion']==2 and manifest['appVersion']=='1.3'
        assert len(manifest['habitLogs'])==2 and len(manifest['goalHistory'])==2
        assert archive.read(next(r['path'] for r in manifest['attachments'] if r['id']=='f'))==b'first\x00bytes'
    expect(page.locator('#global-confirm-phrase')).to_be_visible()
    assert global_domain(page)==before, 'safety preparation mutated source'
    assert page.evaluate('events')==(['export','download','snapshot']+(['inspect'] if mode=='restore' else []))
    assert page.evaluate('async()=> (await TodoStorage.recoverySnapshots.listAll()).length')==1
    page.locator('#global-confirm-phrase').fill('WRONG');click(page,'confirm-action')
    assert global_domain(page)==before, 'wrong phrase changed source'
    if fault=='cancel':
        page.keyboard.press('Escape')
        global_settled(page)
        assert global_domain(page)==before
        return
    page.locator('#global-confirm-phrase').fill(mode.upper());click(page,'confirm-action')
    page.wait_for_function('!document.querySelector("#global-confirm-phrase")')
    global_settled(page)
    if fault=='replace':
        assert global_domain(page)==before, 'rollback did not restore exact raw/native bytes'
        assert 'rollback' in page.evaluate('events')
    elif mode=='reset':
        after=global_domain(page)
        assert not after['attachments'] and not after['habitLogs'] and not after['goalHistory']
        assert all(not json.loads(after['raw'])[k] for k in ['tasks','projects','tags','areas','goals','habits','templates','savedViews'])
    else:
        assert page.evaluate('TodoApp.state.tasks[0].title')=='Incoming title'
        assert len(global_domain(page)['attachments'])==3
    if not fault:assert page.evaluate('events')==['export','download','snapshot']+(['inspect'] if mode=='restore' else [])+['replace','verify','cleanup']
    page.reload();ready(page)
    assert page.evaluate('''async()=>await new Promise((resolve,reject)=>{const r=indexedDB.open('todoAppAttachments');r.onsuccess=()=>{const db=r.result,tx=db.transaction('attachments'),read=tx.objectStore('attachments').count();read.onsuccess=()=>{resolve(read.result);db.close();};};r.onerror=()=>reject(r.error);})''')==3
    if fault=='replace': assert global_domain(page)==before
    elif mode=='reset': assert page.evaluate('TodoApp.state.tasks.length')==0
    else: assert page.evaluate('TodoApp.state.tasks[0].title')=='Incoming title'


def global_fault(page, fault, mode='reset', reload_recovery=False):
    route(page,'settings')
    before=global_domain(page)
    incoming=bytes(page.evaluate('''async()=>[...new Uint8Array(await (await TodoBackup.exportBackupV3(TodoApp.state,TodoStorage,'2026-10-24T10:00:00Z')).arrayBuffer())]''')) if mode=='restore' else None
    page.evaluate('''fault=>{
      window.faultTrace=[];for(const [object,key] of [[TodoStorage,'restoreRecoverySnapshot'],[TodoStorage,'createRecoverySnapshot'],[TodoStorage.recoverySnapshots,'deleteMany']]){const native=object[key];object[key]=async(...args)=>{faultTrace.push(key+':start');const out=await native(...args);faultTrace.push(key+':end');return out;};}
      window.testUndoFault=()=>{};
      const fail=()=>{throw Error('injected '+fault);};
      if(fault==='export')TodoBackup.exportBackupV3=fail;
      if(fault==='download')HTMLAnchorElement.prototype.click=fail;
      if(fault==='snapshot')TodoStorage.recoverySnapshots.put=fail;
      if(fault==='inspect')TodoBackup.inspectBackupV3=fail;
      if(['cleanup','abandoned-cleanup'].includes(fault)){const native=TodoStorage.recoverySnapshots.deleteMany;TodoStorage.recoverySnapshots.deleteMany=fail;testUndoFault=()=>{TodoStorage.recoverySnapshots.deleteMany=native;};}
      if(['clear-attachments','clear-habitLogs','clear-goalHistory'].includes(fault)){const native=IDBObjectStore.prototype.clear;IDBObjectStore.prototype.clear=function(){if(this.name===fault.slice(6)){IDBObjectStore.prototype.clear=native;fail();}return native.call(this);};}
      if(fault==='localStorage'){const native=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='todoAppData'){Storage.prototype.setItem=native;fail();}return native.call(this,key,value);};}
      if(fault==='verify'){const native=TodoStorage.replaceAllValidatedBackup;TodoStorage.replaceAllValidatedBackup=async(...args)=>{await native(...args);const capture=TodoStorage.captureUserData;TodoStorage.captureUserData=async()=>{TodoStorage.captureUserData=capture;const p=await capture();p.habitLogs.push({id:'phantom'});return p;};};}
      if(fault==='rollback'){const native=TodoStorage.replaceAllValidatedBackup,put=IDBObjectStore.prototype.put;TodoStorage.replaceAllValidatedBackup=async(...args)=>{await native(...args);IDBObjectStore.prototype.put=function(...args){if(this.name==='attachments')throw Error('rollback put unavailable');return put.apply(this,args);};testUndoFault=()=>{IDBObjectStore.prototype.put=put;};fail();};}
    }''',fault)
    downloads=[];page.on('download',lambda d:downloads.append(d))
    if mode=='reset':click(page,'reset-app')
    else:page.set_input_files('#backup-import-input',{'name':'incoming.zip','mimeType':'application/zip','buffer':incoming})
    if fault in ['export','download','snapshot','inspect']:
        page.wait_for_function('document.querySelector("#toast-root").textContent.includes("injected")')
        assert global_domain(page)==before
        assert not page.locator('#global-confirm-phrase').count()
        assert page.evaluate('async()=>!(await TodoStorage.recoverySnapshots.listAll()).length')
        assert len(downloads)==(0 if fault in ['export','download'] else 1)
        return
    expect(page.locator('#global-confirm-phrase')).to_be_visible()
    if fault=='abandoned-cleanup':page.keyboard.press('Escape')
    else:
        page.locator('#global-confirm-phrase').fill(mode.upper());click(page,'confirm-action')
    if fault in ['cleanup','abandoned-cleanup','rollback']:
        expect(page.locator('[data-action="retry-global-recovery"]')).to_be_visible()
        assert page.evaluate('async()=> (await TodoStorage.recoverySnapshots.listAll()).length')==1
        if fault=='abandoned-cleanup':assert global_domain(page)==before
        elif fault=='cleanup' and mode=='reset':assert not global_domain(page)['attachments']
        elif fault=='rollback':
            assert 'injected rollback' in page.locator('#toast-root').inner_text()
            assert 'rollback put unavailable' in page.locator('#toast-root').inner_text()
        if reload_recovery:
            page.reload()
            expect(page.locator('[data-action="retry-global-recovery"]')).to_be_visible()
        else:page.evaluate('()=>testUndoFault()')
        click(page,'retry-global-recovery')
    global_settled(page)
    if fault!='cleanup':
        after=global_domain(page)
        assert after==before, str((differences(before,after),page.locator('#toast-root').inner_text(),page.evaluate('faultTrace')))


def global_source_change(page, boundary):
    route(page,'settings')
    if boundary!='confirmation':
        page.evaluate('''boundary=>{const object=boundary==='export'?TodoBackup:TodoStorage,key=boundary==='export'?'exportBackupV3':'createRecoverySnapshot',native=object[key];object[key]=async(...args)=>{const out=await native(...args);TodoApp.state.tasks[0].title='Concurrent edit';localStorage.setItem('todoAppData',JSON.stringify(TodoApp.state));return out;};}''',boundary)
    click(page,'reset-app')
    if boundary=='confirmation':
        expect(page.locator('#global-confirm-phrase')).to_be_visible()
        page.evaluate('''()=>{TodoApp.state.tasks[0].title='Concurrent edit';localStorage.setItem('todoAppData',JSON.stringify(TodoApp.state));}''')
        page.locator('#global-confirm-phrase').fill('RESET');click(page,'confirm-action')
    page.wait_for_function('document.querySelector("#toast-root").textContent.includes("changed")')
    assert page.evaluate('TodoApp.state.tasks[0].title')=='Concurrent edit'
    assert page.evaluate('async()=> (await TodoStorage.attachments.listAll()).length')==3


def global_corrupted_reset(page):
    page.add_init_script('localStorage.setItem("todoAppData","{broken raw")')
    page.reload();page.wait_for_selector('[data-action="recovery-reset"]')
    before=global_domain(page);click(page,'recovery-reset')
    expect(page.locator('[data-action="retry-global-recovery"]')).to_be_visible()
    assert global_domain(page)==before


def global_undo_integration(page, success):
    before=domain(page)
    incoming=bytes(page.evaluate('''async()=>{const b=await TodoBackup.exportBackupV3(TodoApp.state,TodoStorage,'2026-10-24T10:00:00Z'),z=await JSZip.loadAsync(b),m=JSON.parse(await z.file('data.json').async('string')),a=m.attachments.find(a=>a.id==='f');z.file(a.path,'replacement');a.size=11;z.file('data.json',JSON.stringify(m));return [...new Uint8Array(await z.generateAsync({type:'uint8array'}))];}'''))
    trigger(page,'task');confirmed(page);route(page,'settings')
    remaining=page.evaluate('performance.now()')
    if not success:
        page.evaluate('''()=>{const native=TodoStorage.replaceAllValidatedBackup;TodoStorage.replaceAllValidatedBackup=async(...args)=>{await native(...args);throw Error('after native replacement');};}''')
    with page.expect_download():page.set_input_files('#backup-import-input',{'name':'reused.zip','mimeType':'application/zip','buffer':incoming})
    page.locator('#global-confirm-phrase').fill('RESTORE');click(page,'confirm-action')
    global_settled(page)
    if success:
        assert not page.locator('[data-action="undo"]').count()
        page.clock.run_for(7000)
        assert page.evaluate('async()=>await (await TodoStorage.attachments.get("f")).blob.text()')=='replacement'
        assert page.evaluate('TodoApp.state.tasks.some(t=>t.id==="t")')
    else:
        expect(page.locator('[data-action="undo"]')).to_be_visible()
        assert page.evaluate('performance.now()')-remaining<6500
        undo(page);assert domain(page)==before


def global_missing_incoming(page):
    route(page,'settings')
    page.evaluate('''async()=>{const records=await TodoStorage.attachments.listAll();await new Promise((resolve,reject)=>{const r=indexedDB.open('todoAppAttachments',1);r.onupgradeneeded=()=>r.result.createObjectStore('attachments',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('attachments','readwrite');records.forEach(record=>tx.objectStore('attachments').put(record));tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});}''')
    before=global_domain(page)
    incoming=bytes(page.evaluate('''async()=>{const b=await TodoBackup.exportBackupV3(TodoApp.state,TodoStorage,'2026-10-24T10:00:00Z'),z=await JSZip.loadAsync(b),m=JSON.parse(await z.file('data.json').async('string'));z.remove(m.attachments[0].path);return [...new Uint8Array(await z.generateAsync({type:'uint8array'}))];}'''))
    with page.expect_download():page.set_input_files('#backup-import-input',{'name':'missing.zip','mimeType':'application/zip','buffer':incoming})
    page.wait_for_function('document.querySelector("#toast-root").textContent.includes("Missing attachment file")')
    global_settled(page)
    assert not page.locator('#global-confirm-phrase').count()
    assert global_domain(page)==before


def global_mutable_incoming(page):
    route(page,'settings')
    incoming=bytes(page.evaluate('''async()=>[...new Uint8Array(await (await TodoBackup.exportBackupV3(TodoApp.state,TodoStorage,'2026-10-24T10:00:00Z')).arrayBuffer())]'''))
    page.evaluate('''()=>{const native=TodoBackup.inspectBackupV3;TodoBackup.inspectBackupV3=async(...args)=>{window.exposed=await native(...args);return exposed;};}''')
    with page.expect_download():page.set_input_files('#backup-import-input',{'name':'mutable.zip','mimeType':'application/zip','buffer':incoming})
    expect(page.locator('#global-confirm-phrase')).to_be_visible()
    page.evaluate('''()=>{exposed.state.tasks[0].title='MUTATED';exposed.attachmentRecords[0].blob=new Blob(['evil']);exposed.habitLogs.length=0;}''')
    page.locator('#global-confirm-phrase').fill('RESTORE');click(page,'confirm-action');global_settled(page)
    assert page.evaluate('TodoApp.state.tasks[0].title')=='Other task'
    assert page.evaluate('async()=>await (await TodoStorage.attachments.get("f")).blob.text()')=='first\x00bytes'
    assert len(global_domain(page)['habitLogs'])==2


def global_foreign_rollback(page):
    route(page,'settings')
    page.evaluate('''()=>{const native=TodoStorage.replaceAllValidatedBackup;TodoStorage.replaceAllValidatedBackup=async(...args)=>{await native(...args);const incoming=JSON.parse(localStorage.getItem('todoAppData'));incoming.tasks=[{id:'t',title:'Foreign source'}];localStorage.setItem('todoAppData',JSON.stringify(incoming));await TodoStorage.attachments.put({id:'f',taskId:'t',fileName:'foreign',size:5,mimeType:'text/plain',blob:new Blob(['alien'],{type:'text/plain'})});window.foreignRaw=localStorage.getItem('todoAppData');throw Error('after-commit failure');};}''')
    with page.expect_download():click(page,'reset-app')
    page.locator('#global-confirm-phrase').fill('RESET');click(page,'confirm-action')
    page.wait_for_function('document.querySelector("#toast-root").textContent.includes("after-commit failure")')
    assert page.evaluate('localStorage.getItem("todoAppData")===foreignRaw'), 'rollback overwrote a foreign source'
    assert page.evaluate('async()=>await (await TodoStorage.attachments.get("f")).blob.text()')=='alien'
    expect(page.locator('[data-action="retry-global-recovery"]')).to_be_visible()
    assert page.evaluate('async()=> (await TodoStorage.recoverySnapshots.listAll()).length')==1
    click(page,'retry-global-recovery')
    assert page.evaluate('localStorage.getItem("todoAppData")===foreignRaw')


def global_rollback_native_boundary(page, raw_race=False):
    route(page,'settings')
    incoming=bytes(page.evaluate('''async()=>[...new Uint8Array(await (await TodoBackup.exportBackupV3(TodoApp.state,TodoStorage,'2026-10-24T10:00:00Z')).arrayBuffer())]'''))
    page.evaluate('''rawRace=>{
      const replace=TodoStorage.replaceAllValidatedBackup,restore=TodoStorage.restoreRecoverySnapshot,transaction=IDBDatabase.prototype.transaction;
      TodoStorage.restoreRecoverySnapshot=async(...args)=>{window.inRollback=true;return restore(...args);};
      TodoStorage.replaceAllValidatedBackup=async(...args)=>{await replace(...args);const original=await TodoStorage.attachments.get('f');window.incomingRecord={...original,blob:new Blob(['different!!'],{type:original.blob.type})};throw Error('native rollback boundary operation');};
      IDBDatabase.prototype.transaction=function(names,mode,...rest){
        if(window.inRollback && mode==='readwrite' && Array.isArray(names) && names.includes('attachments')){
          window.inRollback=false;
          if(rawRace){const s=JSON.parse(localStorage.getItem('todoAppData'));s.tasks[0].title='Foreign at native boundary';localStorage.setItem('todoAppData',JSON.stringify(s));window.foreignRaw=localStorage.getItem('todoAppData');}
          else {const foreign=transaction.call(this,['attachments'],'readwrite');foreign.objectStore('attachments').put(incomingRecord);}
        }
        return transaction.call(this,names,mode,...rest);
      };
    }''',raw_race)
    with page.expect_download():page.set_input_files('#backup-import-input',{'name':'native.zip','mimeType':'application/zip','buffer':incoming})
    page.locator('#global-confirm-phrase').fill('RESTORE');click(page,'confirm-action')
    expect(page.locator('[data-action="retry-global-recovery"]')).to_be_visible()
    assert 'native rollback boundary operation' in page.locator('#toast-root').inner_text()
    assert 'Recovery also failed' in page.locator('#toast-root').inner_text()
    assert 'Original data was restored' not in page.locator('#toast-root').inner_text()
    if raw_race:assert page.evaluate('localStorage.getItem("todoAppData")===foreignRaw')
    else:assert page.evaluate('async()=>await (await TodoStorage.attachments.get("f")).blob.text()')=='different!!'
    assert page.evaluate('async()=> (await TodoStorage.recoverySnapshots.listAll()).length')==1


def global_verified_phase_failure(page):
    route(page,'settings')
    page.evaluate('''()=>{const native=TodoStorage.recoverySnapshots.put;TodoStorage.recoverySnapshots.put=async record=>{if(record.phase==='committed')throw Error('commit housekeeping denied');return native(record);};}''')
    with page.expect_download():click(page,'reset-app')
    page.locator('#global-confirm-phrase').fill('RESET');click(page,'confirm-action')
    expect(page.locator('[data-action="retry-global-recovery"]')).to_be_visible()
    assert page.evaluate('TodoApp.state.tasks.length')==0
    page.reload();expect(page.locator('[data-action="retry-global-recovery"]')).to_be_visible()
    click(page,'retry-global-recovery');global_settled(page)
    assert page.evaluate('TodoApp.state.tasks.length')==0, 'housekeeping failure rolled back verified new data after reload'
    assert not global_domain(page)['attachments']


def main():
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_args): pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    cases = [(k, lambda p,k=k: roundtrip(p,k)) for k in TYPES]
    cases += [('stale-'+k, lambda p,k=k: stale(p,k)) for k in TYPES if k != 'clear-completed']
    cases += [('inverse-'+k,lambda p,k=k: precise_inverse(p,k)) for k in ['tag','area','goal','habit','subtask','milestone','task']]
    cases += [('displacement',displacement),('fault-attachment',lambda p:fault(p,'attachment','markPending')),('fault-habit',lambda p:fault(p,'habit','habitLogs')),('fault-goal',lambda p:fault(p,'goal','goalHistory')),('undo-retry',undo_retry)]
    cases += [('hold-'+m,lambda p,m=m:lifecycle(p,m)) for m in ['resume','expired-resume','retire']]
    cases += [('wall-'+d,lambda p,d=d:wall_jump(p,d)) for d in ['forward','backward']]
    cases += [('reconstructed-resume',reconstructed_resume),('reconstructed-expired',lambda p:reconstructed_resume(p,True)),('reject-reused-pending',reject_reused_pending),('finalizer-failure',finalizer_failure),('atomic-undo-fault',atomic_undo_fault)]
    cases += [('inflight-'+a,lambda p,a=a:inflight_hold(p,a)) for a in ['undo','finalize']]
    cases += [('retire-'+k,lambda p,k=k:nondelete_retire(p,k)) for k in ['completion','duplicate','template-row']]
    cases += [('conditional-blob-race',conditional_blob_race)]
    cases += [('blob-read-abort',blob_read_abort)]
    cases += [('unused-'+k,lambda p,k=k:unused_roundtrip(p,k)) for k in ['project','tag']]
    cases += [('double-undo',repeated_undo),('expired-undo',lambda p:repeated_undo(p,True)),('task-menu',task_menu_roundtrip),('delete-held',delete_during_hold)]
    cases += [('failed-hold',failed_hold)]
    cases += [('undo-blob-race',undo_blob_race)]
    cases += [('changed-during-prepare',changed_during_prepare)]
    cases += [('rollback-failure',rollback_failure),('rollback-incoming',lambda p:rollback_failure(p,True))]
    cases += [('rollback-'+k,lambda p,k=k:rollback_failure(p,kind=k)) for k in ['habit','goal']]
    cases += [('prep-blob-race',prep_blob_race)]
    cases += [('preparation-window',preparation_does_not_consume_undo)]
    cases += [('pending-blob-changed',pending_blob_changed)]
    cases += [('inflight-status-history',inflight_status_history)]
    cases += [('inflight-habit-status',lambda p:inflight_status_history(p,'habit'))]
    cases += [('changed-project-scope',changed_project_scope)]
    cases += [('undo-boundary-'+b,lambda p,b=b:undo_metadata_boundary(p,b)) for b in ['read','before-native','during-native','after-native','parent','project-parent']]
    cases += [('undo-compensation-failure',undo_compensation_failure),('undo-compensation-replacement',lambda p:undo_compensation_failure(p,True)),('undo-failure-deadline',undo_failure_crosses_deadline)]
    cases += [('undo-failure-before-deadline',undo_failure_before_deadline)]
    cases += [('global-'+mode+('-'+fault if fault else ''),lambda p,m=mode,f=fault:global_safety(p,m,f)) for mode in ['reset','restore'] for fault in [None,'cancel','replace']]
    cases += [('global-'+m+'-'+f,lambda p,m=m,f=f:global_fault(p,f,m)) for m in ['reset','restore'] for f in ['export','download','snapshot','cleanup','abandoned-cleanup','clear-attachments','clear-habitLogs','clear-goalHistory','localStorage','verify','rollback']]
    cases += [('global-restore-inspect',lambda p:global_fault(p,'inspect','restore'))]
    cases += [('global-source-'+b,lambda p,b=b:global_source_change(p,b)) for b in ['export','snapshot','confirmation']]
    cases += [('global-corrupted-reset',global_corrupted_reset)]
    cases += [('global-recovery-reload',lambda p:global_fault(p,'rollback',reload_recovery=True)),('global-cleanup-reload',lambda p:global_fault(p,'cleanup',reload_recovery=True))]
    cases += [('global-undo-retire',lambda p:global_undo_integration(p,True)),('global-undo-rollback',lambda p:global_undo_integration(p,False)),('global-missing-incoming',global_missing_incoming),('global-mutable-incoming',global_mutable_incoming)]
    cases += [('global-foreign-rollback',global_foreign_rollback)]
    cases += [('global-rollback-native-bytes',global_rollback_native_boundary),('global-rollback-native-raw',lambda p:global_rollback_native_boundary(p,True))]
    cases += [('global-verified-phase-failure',global_verified_phase_failure)]
    failures=[]; count=0
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
            try:
                for name,test in cases:
                    if len(sys.argv)>1 and name not in sys.argv[1:]: continue
                    context=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Europe/Belgrade')
                    try:
                        page=context.new_page(); page.set_default_timeout(3500)
                        # Native/action readiness stays strict; cold navigation also
                        # waits for the page's external font/icon stylesheets.
                        page.set_default_navigation_timeout(15000)
                        page.clock.install(time=__import__('datetime').datetime(2026,10,24,12))
                        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                        origin=f'http://127.0.0.1:{server.server_port}'
                        page.goto(origin+'/vendor/')
                        page.add_script_tag(url=origin+'/js/storage.js')
                        page.evaluate('''async()=>{for(const [id,bytes,taskId] of [['f','first\\x00bytes','t'],['f2','second bytes','t'],['fd','completed bytes','done']])await TodoStorage.attachments.put({id,taskId,blob:new Blob([bytes]),size:bytes.length,fileName:id+'.txt',mimeType:'text/plain',createdAt:'2026-10-01T12:00:00Z',updatedAt:'2026-10-01T12:00:00Z',pendingDeleteUntil:null});
                          for(let i=0;i<2;i++){await TodoStorage.habitLogs.put({id:'log'+i,habitId:'h',date:'2026-10-2'+(i+1),status:'done',value:i+2});await TodoStorage.goalHistory.put({id:'hist'+i,goalId:'g',type:'manualProgress',createdAt:'2026-10-2'+(i+1)+'T12:00:00Z',data:{value:i+1}});}
                        }''')
                        page.evaluate('s=>localStorage.setItem("todoAppData",JSON.stringify(s))',SEED)
                        page.goto(origin+'/index.html');ready(page)
                        test(page);assert not errors, errors
                        print('PASS: '+name,flush=True);count+=1
                    except Exception as error:
                        failures.append(name);print('FAIL: '+name+': '+str(error),flush=True)
                    finally: context.close()
            finally: browser.close()
    finally: server.shutdown();server.server_close()
    print(f'Safety native: {count}/{count+len(failures)} passed',flush=True)
    if failures: raise SystemExit(1)


if __name__=='__main__': main()
