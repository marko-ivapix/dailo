"""Tools: real static UI, disposable HTTP origin, native growing stores."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from pathlib import Path
import shutil
import sys
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]

def recurrence_workflows(page,ready,route,click,persisted):
    seed={'version':3,'tasks':[],'projects':[{'id':'p','name':'Project'}],'tags':[{'id':'tag','name':'Tag'}],'areas':[{'id':'a','name':'Area','status':'active'}],'goals':[{'id':'g1','title':'First goal','progressMode':'linkedTasks','taskIds':['r1']},{'id':'g2','title':'Second goal','progressMode':'linkedTasks','taskIds':['r1'],'projectLinks':[{'projectId':'p','contributionMode':'selectedTasks','selectedTaskIds':['r1']}]}],'habits':[],'templates':[],'savedViews':[],'settings':{},'ui':{}}
    base={'title':'Recurring source','notes':'Original notes','projectId':'p','plannedDate':'2026-10-24','dueDate':'2026-10-27','plannedTime':'08:00','dueTime':'17:00','reminderAt':'2026-10-25T08:30:00+01:00','goalIds':['g1','g2'],'tagIds':[],'subtasks':[],'recurrence':{'frequency':'weekly','interval':1,'seriesId':'series-A'}}
    def seed_tasks(tasks):
        page.goto(page.url.split('/index.html')[0]+'/vendor/');data=dict(seed,tasks=tasks);page.evaluate('s=>localStorage.setItem("todoAppData",JSON.stringify(s))',data);page.goto(page.url.replace('/vendor/','/index.html'));ready();route('project/p')
    def task(ident):return page.evaluate('id=>TodoApp.state.tasks.find(t=>t.id===id)',ident)
    def open_task(ident):
        item=task(ident);route('completed' if item['isCompleted'] else 'project/'+item['projectId'] if item['projectId'] else 'today');page.locator('[data-action="open-task"][data-task-id="'+ident+'"]').first.click();expect(page.locator('#detail-title')).to_have_value(task(ident)['title']);page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(resolve))')
    def scope(value):
        expect(page.locator('[data-action="recurrence-scope"][data-scope="'+value+'"]')).to_be_visible();page.locator('[data-action="recurrence-scope"][data-scope="'+value+'"]').click()
    def complete(ident):
        if page.locator('#detail-title').count():page.keyboard.press('Escape')
        route('project/p');page.locator('[data-action="toggle-complete"][data-task-id="'+ident+'"]').first.click();persisted('.tasks.find(t=>t.id==='+repr(ident)+').isCompleted')
    def repeat(ident,action):
        if not page.locator('#detail-title').count():open_task(ident)
        click('task-repeat-picker');page.locator('[data-pop-action="'+action+'"]').click()
    def menu(ident):
        if page.locator('#detail-title').count():page.keyboard.press('Escape');page.keyboard.press('Escape')
        page.locator('[data-action="task-menu"][data-task-id="'+ident+'"]').first.click()
    def template_field(path,value):
        page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(resolve))');control=page.locator('[data-template-field="'+path+'"]');control.fill(value);expect(control).to_have_value(value)
    seed_tasks([dict(base,id='r1',recurrence=None)]);open_task('r1');page.fill('#detail-title','Normal title');page.locator('#detail-notes').focus();expect(page.locator('#detail-notes')).to_be_focused();assert task('r1')['title']=='Normal title';page.fill('#detail-notes','Normal notes');assert task('r1')['notes']=='Normal notes';assert page.locator('[data-action="recurrence-scope"]').count()==0;page.keyboard.press('Escape');page.keyboard.press('Escape');expect(page.locator('#detail-title')).to_have_count(0)
    seed_tasks([dict(base,id='r1')]);open_task('r1');page.fill('#detail-title','Only this title');page.locator('#detail-notes').focus();assert task('r1')['title']=='Recurring source';scope('occurrence');expect(page.locator('#detail-title')).to_have_value('Only this title')
    page.fill('#detail-notes','Only these notes');assert task('r1')['notes']=='Original notes';page.locator('#detail-title').focus();scope('occurrence')
    click('task-plan-picker');page.locator('[data-pop-action="set-plan"][data-date="2026-10-25"]').click();assert task('r1')['plannedDate']=='2026-10-24';scope('occurrence')
    click('task-due-picker');page.locator('[data-pop-action="set-due"][data-date="2026-10-25"]').click();scope('occurrence')
    page.locator('[data-task-time="plannedTime"]').fill('10:00');scope('occurrence')
    page.locator('[data-task-time="dueTime"]').fill('19:00');scope('occurrence')
    click('task-tags-picker');page.locator('[data-pop-action="toggle-tag"]').click();assert task('r1')['tagIds']==[];scope('occurrence')
    click('task-priority-picker');page.locator('[data-pop-action="set-priority"][data-priority="high"]').click();scope('occurrence')
    click('task-reminder-picker');page.locator('[data-pop-action="show-custom-reminder"]').click();page.fill('#custom-reminder-input','2026-10-26T14:00');page.locator('[data-pop-action="custom-reminder-apply"]').click();scope('occurrence')
    page.fill('#detail-subtask','Only this child');page.keyboard.press('Enter');assert task('r1')['subtasks']==[];scope('occurrence')
    click('task-repeat-picker');page.locator('[data-pop-action="set-repeat"][data-frequency="daily"]').click();scope('occurrence')
    complete('r1');successors=page.evaluate('TodoApp.state.tasks.filter(t=>t.id!=="r1")');assert len(successors)==1;successor=successors[0];assert successor['title']=='Recurring source' and successor['notes']=='Original notes';assert successor['plannedDate']=='2026-10-31' and successor['dueDate']=='2026-11-03';assert successor['plannedTime']=='08:00' and successor['dueTime']=='17:00';assert successor['recurrence']['frequency']=='weekly'
    assert successor['tagIds']==[] and successor['priority']=='none' and successor['subtasks']==[];assert page.evaluate('v=>[TodoCore.dateOnly(new Date(v)),new Date(v).getHours(),new Date(v).getMinutes()]',successor['reminderAt'])==['2026-11-01',8,30]
    for goal in page.evaluate('TodoApp.state.goals'):assert successor['id'] in goal['taskIds']
    assert page.evaluate('TodoApp.state.goals[1].projectLinks[0].selectedTaskIds')==['r1']
    click('undo');persisted('.tasks.length===1');assert task('r1')['recurrence']['occurrencesCreated']==0;assert task('r1')['recurrenceSuccessorId'] is None;assert page.evaluate('TodoApp.state.goals.map(g=>g.taskIds)')==[['r1'],['r1']]
    complete('r1');page.reload();ready();assert len(page.evaluate('TodoApp.state.tasks'))==2;next_id=page.evaluate('TodoApp.state.tasks.find(t=>t.id!=="r1").id');assert page.evaluate('id=>TodoApp.state.goals.every(g=>g.taskIds.includes(id))',next_id)
    route('completed');page.locator('[data-action="toggle-complete"][data-task-id="r1"]').click();complete('r1');assert len(page.evaluate('TodoApp.state.tasks'))==2
    print('PASS: ordinary focus/autosave plus recurring title/notes/date/independent-time/rule/tag/priority/reminder/subtask scope, NEW baseline successor, multiple Goal rebind/reload/Undo and reopen prevention (15 cases)')
    siblings=[dict(base,id='r1'),dict(base,id='future',plannedDate='2026-10-31',dueDate='2026-11-03'),dict(base,id='past',plannedDate='2026-10-17'),dict(base,id='done',plannedDate='2026-11-07',isCompleted=True,completedAt='2026-10-24T08:00:00Z'),dict(base,id='other',recurrence={'frequency':'weekly','interval':1})]
    seed_tasks(siblings);unchanged={id:task(id) for id in ['past','done','other']};open_task('r1');page.fill('#detail-title','Future title');page.locator('#detail-notes').focus();scope('future');assert task('future')['title']=='Future title';branch=task('r1')['recurrence']['seriesId'];assert branch!='series-A' and task('future')['recurrence']['seriesId']==branch
    click('task-plan-picker');page.locator('[data-pop-action="set-plan"][data-date="2026-10-25"]').click();scope('future');assert task('future')['plannedDate']=='2026-11-01' and task('future')['dueDate']=='2026-11-03'
    click('task-due-picker');page.locator('[data-pop-action="set-due"][data-date="2026-10-25"]').click();scope('future');assert task('future')['dueDate']=='2026-11-01' and task('future')['plannedDate']=='2026-11-01'
    click('task-repeat-picker');page.locator('[data-pop-action="set-repeat"][data-frequency="daily"]').click();scope('future');assert task('future')['plannedDate']=='2026-11-01';assert task('future')['recurrence']['frequency']=='daily'
    for id,value in unchanged.items():assert task(id)==value
    page.reload();ready();assert task('other')['recurrence']['seriesId']=='other';assert task('r1')['recurrence']['seriesId']==task('future')['recurrence']['seriesId']
    open_task('r1');page.fill('#detail-title','Canceled');page.locator('#detail-notes').focus();expect(page.locator('[data-action="recurrence-scope"]')).to_have_count(2);page.keyboard.press('Escape');assert task('r1')['title']=='Future title',task('r1')['title'];expect(page.locator('#detail-title')).to_be_focused();page.keyboard.press('Escape');page.keyboard.press('Escape');expect(page.locator('#detail-title')).to_have_count(0)
    print('PASS: This and future pending-only branch, independent planned/due deltas, rule-only dates, legacy identity reload and scope Escape/focus (6 cases)')
    seed_tasks([dict(base,id='r1',dueDate=None),dict(base,id='future',plannedDate='2026-10-31',dueDate=None,reminderAt=None)]);open_task('r1');click('task-due-picker');page.locator('[data-pop-action="set-due"][data-date="2026-10-25"]').click();scope('future');assert task('future')['dueDate']=='2026-11-01';assert task('future')['plannedDate']=='2026-10-31'
    click('task-reminder-picker');page.locator('[data-pop-action="show-custom-reminder"]').click();page.fill('#custom-reminder-input','2026-10-26T14:00');page.locator('[data-pop-action="custom-reminder-apply"]').click();scope('future');assert page.evaluate('v=>[TodoCore.dateOnly(new Date(v)),new Date(v).getHours()]',task('future')['reminderAt'])==['2026-11-02',14]
    seed_tasks([dict(base,id='r1')]);open_task('r1');click('task-repeat-picker');page.locator('[data-pop-action="set-repeat"][data-frequency=""]').click();scope('occurrence');assert task('r1')['recurrence'] is None;page.fill('#detail-title','Still just this');page.locator('#detail-notes').focus();scope('occurrence');complete('r1');assert page.evaluate('TodoApp.state.tasks.find(t=>!t.isCompleted).title')=='Recurring source';assert page.evaluate('TodoApp.state.tasks.find(t=>!t.isCompleted).plannedDate')=='2026-10-31'
    seed_tasks([dict(base,id='r1')]);open_task('r1');page.fill('#detail-title','Occurrence only');page.locator('#detail-notes').focus();scope('occurrence');click('task-repeat-picker');page.locator('[data-pop-action="set-repeat"][data-frequency="daily"]').click();scope('occurrence');repeat('r1','pause-recurrence');complete('r1');assert len(page.evaluate('TodoApp.state.tasks'))==1;repeat('r1','resume-recurrence');resumed=page.evaluate('TodoApp.state.tasks.find(t=>!t.isCompleted)');assert resumed['title']=='Recurring source' and resumed['plannedDate']=='2026-10-31' and resumed['recurrence']['frequency']=='weekly'
    seed_tasks([dict(base,id='r1')]);repeat('r1','pause-recurrence');complete('r1');assert len(page.evaluate('TodoApp.state.tasks'))==1;repeat('r1','resume-recurrence');assert len(page.evaluate('TodoApp.state.tasks'))==2;repeat('r1','pause-recurrence');repeat('r1','resume-recurrence');assert len(page.evaluate('TodoApp.state.tasks'))==2
    seed_tasks([dict(base,id='r1')]);repeat('r1','pause-recurrence');repeat('r1','resume-recurrence');complete('r1');assert page.evaluate('TodoApp.state.tasks.find(t=>!t.isCompleted).plannedDate')=='2026-10-31'
    seed_tasks([dict(base,id='r1')]);repeat('r1','skip-recurrence');complete('r1');next_id=page.evaluate('TodoApp.state.tasks.find(t=>t.id!=="r1").id');assert task(next_id)['plannedDate']=='2026-11-07';assert task(next_id)['recurrence']['skipNext'] is False;click('undo');assert task('r1')['recurrence']['skipNext'] is True and task('r1')['recurrence']['occurrencesCreated']==0;complete('r1');next_id=page.evaluate('TodoApp.state.tasks.find(t=>t.id!=="r1").id');complete(next_id);assert page.evaluate('TodoApp.state.tasks.find(t=>!t.isCompleted).plannedDate')=='2026-11-14'
    seed_tasks([dict(base,id='r1')]);repeat('r1','end-recurrence');complete('r1');assert len(page.evaluate('TodoApp.state.tasks'))==1
    seed_tasks([dict(base,id='r1'),dict(base,id='history',plannedDate='2026-10-17',isCompleted=True,completedAt='2026-10-20T08:00:00Z')]);history=task('history');complete('r1');live=page.evaluate('TodoApp.state.tasks.find(t=>!t.isCompleted).id');repeat('r1','pause-recurrence');assert task(live)['recurrence']['status']=='paused';assert task('history')==history;repeat('r1','resume-recurrence');assert task(live)['recurrence']['status']=='active';assert len(page.evaluate('TodoApp.state.tasks'))==3;repeat('r1','skip-recurrence');assert task(live)['recurrence']['skipNext'] is True and task('r1')['recurrence']['skipNext'] is False;complete(live);assert page.evaluate('TodoApp.state.tasks.find(t=>!t.isCompleted).plannedDate')=='2026-11-14'
    live=page.evaluate('TodoApp.state.tasks.find(t=>!t.isCompleted).id');repeat('r1','end-recurrence');assert task(live)['recurrence']['status']=='ended';complete(live);assert page.evaluate('TodoApp.state.tasks.every(t=>t.isCompleted)');assert task('history')==history
    for end_type,end_value in [('date','2026-10-26'),('afterOccurrences','3')]:
        seed_tasks([dict(base,id='r1',dueDate=None,recurrence={'frequency':'daily','interval':1})]);repeat('r1','show-custom-repeat');page.fill('#repeat-interval','0');page.locator('[data-pop-action="custom-repeat-apply"]').click();assert page.locator('.popover [role="alert"]').count()==1;page.fill('#repeat-interval','1.5');page.locator('[data-pop-action="custom-repeat-apply"]').click();assert page.locator('.popover [role="alert"]').count()==1;page.fill('#repeat-interval','1');page.select_option('#repeat-end-type',end_type)
        if end_type=='afterOccurrences':
            for invalid in ['0','-1','1.5']:
                page.fill('#repeat-end-count',invalid);page.locator('[data-pop-action="custom-repeat-apply"]').click();assert page.locator('.popover [role="alert"]').count()==1;assert task('r1')['recurrence']['endType']=='never'
        page.fill('#repeat-end-date' if end_type=='date' else '#repeat-end-count',end_value);page.locator('[data-pop-action="custom-repeat-apply"]').click();scope('future')
        for _ in range(3):ident=page.evaluate('TodoApp.state.tasks.find(t=>!t.isCompleted).id');complete(ident)
        assert page.evaluate('TodoApp.state.tasks.map(t=>t.plannedDate)')==['2026-10-24','2026-10-25','2026-10-26'];assert page.evaluate('TodoApp.state.tasks.every(t=>t.isCompleted)')
    print('PASS: open/terminal paused resume, skip live chain/runtime Undo, explicit end, inclusive end date/total N and ordinary positive-integer interval/count validation (10 cases)')
    seed_tasks([dict(base,id='r1',projectId=None,areaId='a',tagIds=['tag'])]);open_task('r1');click('task-project-picker');page.locator('[data-pop-action="set-project"][data-project-id="p"]').click();assert task('r1')['projectId'] is None;scope('occurrence');page.keyboard.press('Escape');page.keyboard.press('Escape')
    route('area/a');click('area-menu');page.locator('[data-pop-action="delete-area"]').click();click('confirm-action');persisted('.areas.length===0')
    route('tags');click('tag-menu');page.locator('[data-pop-action="delete-tag"]').click();click('confirm-action');persisted('.tags.length===0')
    route('goal/g1');click('goal-menu');page.locator('[data-pop-action="delete-goal"]').click();click('confirm-action');persisted('.goals.every(g=>g.id!=="g1")');complete('r1');next=page.evaluate('TodoApp.state.tasks.find(t=>!t.isCompleted)');assert next['projectId'] is None and next['areaId'] is None and next['tagIds']==[] and next['goalIds']==['g2'];assert page.evaluate('id=>TodoApp.state.goals[0].taskIds.includes(id)',next['id']);page.reload();ready();assert page.evaluate('TodoCore.validateStateV3(JSON.parse(localStorage.getItem("todoAppData"))).ok')
    print('PASS: occurrence-only Project move survives Area/Tag/Goal deletion, new baseline successor prunes missing refs and retains valid Goal backrefs after reload (4 cases)')
    seed_tasks([dict(base,id='r1',recurrence={'frequency':'weekly','interval':2,'status':'paused','endType':'date','endDate':'2026-11-21','occurrencesCreated':2,'skipNext':True,'seriesId':'old'})]);menu('r1');page.locator('[data-pop-action="task-duplicate"]').click();copy=page.evaluate('TodoApp.state.tasks.find(t=>t.id!=="r1")');assert copy['recurrence']['seriesId']==copy['id'];assert copy['recurrence']['status']=='active' and copy['recurrence']['occurrencesCreated']==0 and copy['recurrence']['skipNext'] is False;assert copy['recurrence']['endDate']=='2026-11-21'
    for goal in page.evaluate('TodoApp.state.goals'):assert copy['id'] in goal['taskIds']
    assert copy['plannedDate']=='2026-10-24' and copy['dueDate']=='2026-10-27';page.reload();ready();assert page.evaluate('id=>TodoApp.state.goals.every(g=>g.taskIds.includes(id))',copy['id']);menu('r1');page.locator('[data-pop-action="task-duplicate"]').click();second=page.evaluate('ids=>TodoApp.state.tasks.find(t=>!ids.includes(t.id)).id',['r1',copy['id']]);click('undo');assert page.evaluate('id=>TodoApp.state.goals.every(g=>JSON.stringify(g.taskIds)===JSON.stringify(["r1",id]))',copy['id']);assert page.evaluate('id=>TodoApp.state.tasks.every(t=>t.id!==id)',second)
    menu('r1');page.locator('[data-pop-action="save-template"]').click();page.fill('#template-name','Recurring kit');click('save-template');route('templates');row=page.locator('[data-template-row]').filter(has_text='Recurring kit');row.locator('[data-action="edit-template"]').click();template_field('recurrence.interval','0');click('save-template');assert page.locator('[role="alert"]').count()==1;template_field('recurrence.interval','2');page.locator('[data-template-field="recurrence.endType"]').select_option('afterOccurrences');template_field('recurrence.endAfterOccurrences','1.5');click('save-template');assert page.locator('[role="alert"]').count()==1;template_field('recurrence.endAfterOccurrences','');page.locator('[data-template-field="recurrence.endType"]').select_option('date');click('save-template')
    page.evaluate("__setNow('2026-11-10T12:00:00')");row.locator('[data-action="use-template"]').click();page.fill('#quick-title','New independent');click('create-task');instance=page.evaluate('TodoApp.state.tasks.find(t=>t.title==="New independent")');assert instance['recurrence']['endDate']=='2026-12-08';assert instance['recurrence']['seriesId']==instance['id'];assert instance['recurrence']['status']=='active' and instance['recurrence']['occurrencesCreated']==0 and instance['recurrence']['skipNext'] is False;assert task('r1')['recurrence']['status']=='paused'
    page.reload();ready();assert page.evaluate('TodoCore.validateStateV3(JSON.parse(localStorage.getItem("todoAppData"))).ok')
    print('PASS: duplicate Goal binding/Undo, fresh active identity/runtime, fixed duplicate versus relative template end dates, validation and native reload (5 cases)')


def saved_views_and_shortcuts(page, ready, route, click, persisted):
    seed={'version':3,'areas':[{'id':'work','name':'Work','status':'active','isPinned':True},{'id':'home','name':'Home','status':'active'}],'projects':[{'id':'work-p','name':'Work project','areaId':'work'},{'id':'home-p','name':'Home project','areaId':'home'}],'tags':[{'id':'focus','name':'Focus'}],'tasks':[],'goals':[],'habits':[],'templates':[],'savedViews':[],'settings':{},'ui':{}}
    base={'priority':'high','tagIds':['focus'],'plannedDate':'2026-10-24','dueDate':'2026-10-25','isCompleted':False,'notes':'Notes','subtasks':[]}
    seed['tasks']=[dict(base,id='direct',title='Direct work',projectId=None,areaId='work'),dict(base,id='inherited',title='Inherited work',projectId='work-p',areaId=None),dict(base,id='home-task',title='Home task',projectId='home-p',areaId=None),dict(base,id='done',title='Done task',projectId=None,areaId='work',isCompleted=True,completedAt='2026-10-24T09:00:00Z')]
    seed['tasks'] += [dict(base,id='negative-'+k,title='Wrong '+k,areaId='work',projectId=None,**{k:v}) for k,v in [('priority','low'),('tagIds',[]),('plannedDate','2026-10-23'),('dueDate','2026-10-23')]]
    seed['tasks'].append(dict(base,id='reminder-task',title='Reminder delivery',areaId='home',projectId=None,plannedDate=None,dueDate=None,reminderAt='2026-10-24T13:00:00Z'))
    seed['tasks'] += [dict(base,id='date-'+str(i),title='Date '+str(i),areaId='home',projectId=None,plannedDate=d,dueDate=d) for i,d in enumerate(['2026-10-23','2026-10-24','2026-10-25',None])]
    seed['goals']=[{'id':'g-match','title':'Work active goal','areaId':'work','status':'active','targetDate':'2026-10-24'},{'id':'g-paused','title':'Work paused goal','areaId':'work','status':'paused','targetDate':'2026-10-25'},{'id':'g-home','title':'Home goal','areaId':'home','status':'active','targetDate':'2026-10-24'}]
    seed['habits']=[{'id':'h-match','name':'Work active habit','areaId':'work','status':'active','trackingType':'checkbox','frequencyType':'daily','startDate':'2026-10-01'},{'id':'h-paused','name':'Work paused habit','areaId':'work','status':'paused'},{'id':'h-home','name':'Home habit','areaId':'home','status':'active'}]
    page.goto(page.url.replace('/index.html','/vendor/'))
    page.evaluate('s=>localStorage.setItem("todoAppData",JSON.stringify(s))',seed)
    page.goto(page.url.replace('/vendor/','/index.html'))
    page.reload();ready();route('saved-views')
    assert page.evaluate('TodoApp.state.areas.map(a=>a.id)')==['work','home']
    assert page.locator('.page-title').inner_text()=='Saved Views'
    def svfield(key,value):
        control=page.locator('[data-saved-filter="'+key+'"]')
        if control.evaluate('e=>e.tagName')=='SELECT':control.select_option(value)
        else:control.fill(value)
    def author(name,kind,filters,pin=False):
        click('new-saved-view');page.fill('#saved-view-name',name);page.select_option('#saved-view-type',kind)
        for key,value in filters.items():svfield(key,value)
        if pin:page.check('#saved-view-pinned')
        click('save-saved-view');persisted('.savedViews.some(v=>v.name==='+repr(name)+')')
        return page.evaluate('n=>TodoApp.state.savedViews.find(v=>v.name===n).id',name)
    def results(ident,kind,want):
        route('saved-view/'+ident)
        box=page.locator('[data-saved-results]')
        selector={'tasks':'.task-row','goals':'.goal-row','habits':'.habit-row'}[kind]
        assert box.locator(selector).count()==len(want),box.inner_text()
        for title in want:assert title in box.inner_text()
        for other in ['tasks','goals','habits']:
            if other!=kind:assert box.locator({'tasks':'.task-row','goals':'.goal-row','habits':'.habit-row'}[other]).count()==0
    task=author('Focus work','tasks',{'areaId':'work','tagId':'focus','priority':'high','completion':'open','plannedDate':'2026-10-24','dueDate':'2026-10-25'},True)
    results(task,'tasks',['Direct work','Inherited work'])
    # Consume normal row open/completion actions, not an alternate saved-result state.
    page.locator('[data-saved-results] [data-action="open-task"]').first.click();assert page.locator('#detail-title').count()==1;page.keyboard.press('Escape');page.keyboard.press('Escape')
    page.locator('[data-saved-results] [data-action="toggle-complete"]').first.click();persisted('.tasks.find(t=>t.id==="direct").isCompleted');assert page.locator('[data-saved-results] .task-row').count()==1
    route('completed');page.locator('[data-action="toggle-complete"][data-task-id="direct"]').click();persisted('.tasks.find(t=>t.id==="direct").isCompleted===false')
    route('saved-views');row=page.locator('[data-saved-view-row="'+task+'"]');row.locator('[data-action="edit-saved-view"]').click();svfield('projectId','work-p');click('save-saved-view');results(task,'tasks',['Inherited work'])
    route('saved-views');row.locator('[data-action="duplicate-saved-view"]').click();copy=page.evaluate('TodoApp.state.savedViews.find(v=>v.name==="Focus work copy").id');copyrow=page.locator('[data-saved-view-row="'+copy+'"]')
    assert page.evaluate('ids=>{const a=TodoApp.state.savedViews.find(v=>v.id===ids[0]),b=TodoApp.state.savedViews.find(v=>v.id===ids[1]);return a.type===b.type && a.isPinned===b.isPinned && JSON.stringify(a.filters)===JSON.stringify(b.filters) && a.filters!==b.filters}',[task,copy])
    copyrow.locator('[data-action="edit-saved-view"]').click();page.fill('#saved-view-name','Independent copy');svfield('projectId','');svfield('areaId','home');click('save-saved-view');results(copy,'tasks',['Home task']);results(task,'tasks',['Inherited work'])
    route('saved-views');copyrow.locator('[data-action="delete-saved-view"]').click();click('close-modal');assert copyrow.count()==1
    copyrow.locator('[data-action="delete-saved-view"]').click();click('confirm-action');persisted('.savedViews.every(v=>v.id!=='+repr(copy)+')');click('undo');persisted('.savedViews.some(v=>v.id==='+repr(copy)+')');results(copy,'tasks',['Home task'])
    route('saved-views');goal=author('Goal work','goals',{'areaId':'work','status':'active','targetDate':'2026-10-24'});results(goal,'goals',['Work active goal']);page.locator('[data-saved-results] [data-route="goal/g-match"]').click();expect(page.locator('.page-title')).to_have_text('Work active goal');assert page.locator('#sidebar [data-route="goals"].is-active').count()==1
    route('saved-views');habit=author('Habit work','habits',{'areaId':'work','status':'active'});results(habit,'habits',['Work active habit']);page.locator('[data-saved-results] [data-action="habit-checkin"]').click();page.wait_for_function('TodoApp.state.habitLogCache["h-match"]?.some(l=>l.date==="2026-10-24" && l.status==="done")');page.locator('[data-saved-results] [data-route="habit/h-match"]').click();expect(page.locator('.page-title')).to_have_text('Work active habit')
    route('saved-views');dateview=author('Exact date','tasks',{'areaId':'home','plannedDate':'2026-10-24','dueDate':'2026-10-24'});results(dateview,'tasks',['Date 1'])
    route('saved-views');page.locator('[data-saved-view-row="'+dateview+'"] [data-action="edit-saved-view"]').click();page.select_option('#saved-view-type','goals');svfield('status','active');click('save-saved-view');assert page.evaluate('id=>TodoApp.state.savedViews.find(v=>v.id===id).filters',dateview)=={'areaId':'home','status':'active'}
    page.locator('[data-saved-view-row="'+dateview+'"] [data-action="edit-saved-view"]').click();svfield('status','completed');page.select_option('#saved-view-type','habits');click('save-saved-view');assert page.evaluate('id=>TodoApp.state.savedViews.find(v=>v.id===id).filters',dateview)=={'areaId':'home'}
    print('PASS: Saved Views task intersection/inheritance, exact dates, Goal/Habit filters, normal result actions, CRUD/confirmation/full Undo, duplicate independence and type cleanup (10 cases)')
    sidebar=page.locator('#sidebar')
    route('area/work');click('area-menu');page.locator('[data-pop-action="unpin-area"]').click();assert sidebar.locator('[data-route="area/work"]').count()==0;click('area-menu');page.locator('[data-pop-action="pin-area"]').click();persisted('.areas.find(a=>a.id==="work").isPinned')
    assert sidebar.locator('[data-sidebar-section]').evaluate_all('es=>es.map(e=>e.dataset.sidebarSection)')==['work','progress','tools','pinned-areas','pinned-views','more']
    assert sidebar.locator('.nav-group [data-route]').evaluate_all('es=>es.map(e=>e.dataset.route)')==['today','inbox','upcoming','calendar']
    assert sidebar.locator('[data-sidebar-section="pinned-areas"] [data-route="area/work"]').count()==1
    assert sidebar.locator('[data-sidebar-section="pinned-views"] [data-route="saved-view/'+task+'"]').count()==1
    sections=['work','progress','tools','pinned-areas','pinned-views','more']
    for section in sections:sidebar.locator('[data-action="toggle-sidebar-section"][data-section="'+section+'"]').click()
    page.reload();ready()
    for section in sections:assert not sidebar.locator('[data-sidebar-section="'+section+'"] .sidebar-section-body').is_visible()
    sidebar.locator('[data-action="toggle-sidebar-section"][data-section="work"]').click();page.reload();ready();assert sidebar.locator('[data-sidebar-section="work"] .sidebar-section-body').is_visible()
    route('saved-views');row.locator('[data-action="pin-saved-view"]').click();assert sidebar.locator('[data-route="saved-view/'+task+'"]').count()==0;row.locator('[data-action="pin-saved-view"]').click();persisted('.savedViews.find(v=>v.id==='+repr(task)+').isPinned')
    print('PASS: ordered sidebar/daily links, independent pin/unpin, all six collapsed groups and expanded-state real reload (4 cases)')
    for destination,title in [('anytime','Anytime'),('archived','Archived Projects'),('completed','Completed'),('settings','Settings')]:
        click('more-menu')
        page.locator('.popover [data-route="anytime"]' if destination=='anytime' else '.popover [data-more-route="'+destination+'"]').click()
        expect(page.locator('.page-title')).to_have_text(title)
    print('PASS: preserved More trigger and all four visible More/Anytime navigation paths (1 case)')
    defaults={'newTask':'N','search':'Ctrl/Cmd+F','today':'T','inbox':'I','upcoming':'U','calendar':'C','goals':'G','habits':'H','templates':'Shift+T'}
    for command,binding in defaults.items():
        route('saved-views');page.locator('.page-title').click();page.keyboard.press('ControlOrMeta+F' if command=='search' else binding)
        if command=='newTask':expect(page.locator('#quick-title')).to_be_focused();page.keyboard.press('Escape')
        elif command=='search':expect(page.locator('#search-query')).to_be_focused();page.keyboard.press('Escape')
        else:page.wait_for_function('v=>location.hash==="#"+v',arg=command);expect(page.locator('.page-title')).to_have_text(command.capitalize())
    def shortcut(command,value):
        page.locator('[data-shortcut="'+command+'"]').fill(value);page.locator('[data-action="save-shortcut"][data-command="'+command+'"]').click()
    route('settings');shortcut('today','y+alt');assert page.locator('[data-shortcut="today"]').input_value()=='Alt+Y'
    shortcut('inbox','ALT+y');assert page.locator('[role="alert"]').count()==1;assert page.evaluate('TodoApp.state.settings.shortcuts.inbox')=='I'
    shortcut('inbox','meta+f');assert page.locator('[role="alert"]').count()==1;assert page.evaluate('TodoApp.state.settings.shortcuts.inbox')=='I'
    page.locator('[data-action="disable-shortcut"][data-command="habits"]').click();persisted('.settings.shortcuts.habits===null');page.reload();ready();assert page.locator('[data-shortcut="today"]').input_value()=='Alt+Y';assert page.locator('[data-shortcut="habits"]').input_value()==''
    route('inbox');page.locator('.page-title').click();page.keyboard.press('T');assert page.evaluate('location.hash')=='#inbox';page.keyboard.press('H');assert page.evaluate('location.hash')=='#inbox';page.keyboard.press('Alt+Y');page.wait_for_function('location.hash==="#today"')
    route('inbox');page.locator('.page-title').dispatch_event('keydown',{'key':'¥','code':'KeyY','altKey':True,'bubbles':True});page.wait_for_function('location.hash==="#today"')
    route('inbox');page.locator('.page-title').dispatch_event('keydown',{'key':'y','altKey':True,'bubbles':True});page.wait_for_function('location.hash==="#today"')
    route('inbox');page.locator('.page-title').dispatch_event('keydown',{'key':'¥','code':'KeyY','altKey':True,'isComposing':True,'bubbles':True});assert page.evaluate('location.hash')=='#inbox'
    route('settings');shortcut('today','Alt+8');route('inbox');page.locator('.page-title').dispatch_event('keydown',{'key':'∞','code':'Digit8','altKey':True,'bubbles':True});page.wait_for_function('location.hash==="#today"')
    route('settings');page.locator('[data-action="disable-shortcut"][data-command="search"]').click();persisted('.settings.shortcuts.search===null');route('inbox');page.locator('.page-title').click();page.keyboard.press('/');assert page.locator('#search-query').count()==0;page.keyboard.press('ControlOrMeta+F');assert page.locator('#search-query').count()==0
    route('settings');shortcut('today','/');shortcut('search','Ctrl/Cmd+F');shortcut('search','/');assert page.locator('[role="alert"]').count()==1;assert page.evaluate('TodoApp.state.settings.shortcuts.search')=='Ctrl/Cmd+F';route('inbox');page.locator('.page-title').click();page.keyboard.press('/');page.wait_for_function('location.hash==="#today"');assert page.locator('#search-query').count()==0
    route('settings');click('reset-shortcuts');assert page.evaluate('TodoApp.state.settings.shortcuts')==defaults
    route('inbox');page.locator('.page-title').click();page.keyboard.press('/');expect(page.locator('#search-query')).to_be_focused();page.keyboard.press('Escape')
    route('inbox');page.locator('.page-title').click();page.keyboard.press('T');page.wait_for_function('location.hash==="#today"');page.keyboard.press('H');page.wait_for_function('location.hash==="#habits"');page.keyboard.press('Alt+Y');assert page.evaluate('location.hash')=='#habits'
    print('PASS: nine actual defaults, portable alias conflict, remap/old key, disable/reset/reload, modified macOS code/fallback and disabled Search/slash ownership (19 cases)')
    def blocked(selector):
        control=page.locator(selector);control.focus();before=page.evaluate('location.hash');search_count=page.locator('#search-query').count();page.keyboard.press('T');page.keyboard.press('N');page.keyboard.press('C');page.keyboard.press('G');page.keyboard.press('Shift+T');page.keyboard.press('ControlOrMeta+F');assert page.evaluate('location.hash')==before,(selector,'route changed');assert page.locator('#quick-title').count()==0,(selector,'quick opened');assert page.locator('#search-query').count()==search_count,(selector,'search changed');assert control.evaluate('e=>e===document.activeElement'),(selector,page.evaluate('document.activeElement.outerHTML'))
    route('settings');blocked('[data-shortcut="today"]')
    route('saved-views');click('new-saved-view');expect(page.locator('#saved-view-name')).to_be_focused();blocked('#saved-view-name');blocked('#saved-view-type');page.fill('#saved-view-name','');click('save-saved-view');assert page.locator('[role="alert"]').count()==1;click('close-modal')
    route('inbox');click('open-search');blocked('#search-query');page.keyboard.press('Escape')
    route('saved-view/'+task);page.locator('[data-action="open-task"]').first.click();blocked('#detail-notes');blocked('#detail-title');page.keyboard.press('Escape');page.keyboard.press('Escape')
    # Native contenteditable descendant guards the DOM contract; no app editor uses contenteditable today.
    page.evaluate('()=>{let e=document.createElement("div");e.id="editable-probe";e.contentEditable="true";e.textContent="Editable";document.querySelector("#main").append(e)}');blocked('#editable-probe');page.locator('.page-title').click();page.keyboard.press('T');page.wait_for_function('location.hash==="#today"')
    route('saved-views');page.locator('[data-action="new-saved-view"]').click();expect(page.locator('#saved-view-name')).to_be_focused();page.locator('[data-action="save-saved-view"]').focus();before=page.evaluate('location.hash');page.keyboard.press('H');assert page.evaluate('location.hash')==before;assert page.locator('#saved-view-name').count()==1;page.keyboard.press('Escape');expect(page.locator('[data-action="new-saved-view"]')).to_be_focused()
    page.reload();ready();assert page.evaluate('TodoCore.validateStateV3(JSON.parse(localStorage.getItem("todoAppData"))).ok')
    print('PASS: input/textarea/select/contenteditable/search/task editor/modal-button suppression and Escape focus return (8 cases)')
    route('tags');click('tag-menu');page.locator('[data-pop-action="delete-tag"]').click();click('confirm-action');persisted('.tags.length===0');results(task,'tasks',[])
    print('PASS: a deleted referenced filter target returns zero rendered results rather than broadening (1 case)')
    route('saved-views')
    page.clock.install(time='2026-10-24T12:00:00+02:00')
    copyrow=page.locator('[data-saved-view-row="'+copy+'"]')
    copyrow.locator('[data-action="delete-saved-view"]').click();click('confirm-action');persisted('.savedViews.every(v=>v.id!=='+repr(copy)+')')
    page.clock.set_system_time('2026-10-24T15:01:00+02:00')
    page.evaluate('TodoApp.checkReminders()')
    assert page.locator('#toast-root').inner_text().find('Reminder: Reminder delivery')>=0
    assert page.locator('[data-action="undo"]').count()==1
    page.clock.run_for(3100)
    assert page.locator('[data-action="undo"]').count()==1
    click('undo');persisted('.savedViews.some(v=>v.id==='+repr(copy)+')')
    # A subsequent normal deletion retains the original full 6500ms window.
    copyrow.locator('[data-action="delete-saved-view"]').click();click('confirm-action');page.clock.run_for(6400);assert page.locator('[data-action="undo"]').count()==1;page.clock.run_for(101);assert page.locator('[data-action="undo"]').count()==0
    print('PASS: actually due reminder stays perceivable with Undo, info timer does not shorten Undo, persisted restoration and original 6500ms expiry (2 cases)')


def main():
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            executable = (shutil.which('chromium') or shutil.which('chromium-browser') or next((str(x) for x in [Path('/usr/bin/chromium'), Path('/Applications/Chromium.app/Contents/MacOS/Chromium')] if x.exists()), None))
            args = {'headless': True, 'args': ['--no-sandbox']}
            if executable:
                args['executable_path'] = executable
            browser = p.chromium.launch(**args)
            try:
                context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Europe/Belgrade')
                try:
                    context.add_init_script("""{
                      const NativeDate=Date; let current=new NativeDate('2026-10-24T12:00:00').getTime();
                      window.Date=class extends NativeDate { constructor(...a){super(...(a.length?a:[current]));} static now(){return current;} };
                      window.__setNow=value=>{current=new NativeDate(value).getTime();};
                    }""")
                    page = context.new_page()
                    page.set_default_timeout(5000)
                    errors = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    url = f'http://127.0.0.1:{server.server_port}/index.html'
                    page.goto(url)
                    page.wait_for_function('window.TodoApp && TodoApp.ready')
                    page.evaluate('TodoApp.ready')
                    expect(page.locator('.page-title')).to_have_text('Today')
                    assert page.locator('#sidebar [data-sidebar-section]').count()==6
                    print('PASS: native empty-storage Today-first startup and six sidebar groups (1 case)')
                    if '--recurrence-only' in sys.argv:
                        def ready():page.wait_for_function('window.TodoApp && TodoApp.ready');page.evaluate('TodoApp.ready')
                        def route(value):page.evaluate('v=>location.hash="#"+v',value);page.wait_for_function('v=>location.hash==="#"+v',arg=value);expect(page.locator('.page-title')).to_have_text({'project/p':'Project','completed':'Completed','templates':'Templates','area/a':'Area','goal/g1':'First goal'}.get(value,value.capitalize()))
                        def click(action):page.locator('[data-action="'+action+'"]').first.click()
                        def persisted(expression):page.wait_for_function('JSON.parse(localStorage.getItem("todoAppData"))'+expression)
                        recurrence_workflows(page,ready,route,click,persisted);assert not errors,errors;return
                    page.goto(url.replace('/index.html', '/vendor/'))
                    seed = {'version': 3, 'tasks': [], 'projects': [], 'tags': [{'id':'tag','name':'Tag'}], 'areas':[{'id':'a','name':'Area','status':'active'}], 'goals':[], 'habits':[], 'templates':[], 'savedViews':[], 'settings':{'weekStartsOn':'monday'}, 'ui':{}}
                    seed['projects']=[{'id':'p','name':'Source project','areaId':'a','goalIds':['g'],'isArchived':False}]
                    seed['tasks']=[{'id':'t','title':'Source task','projectId':'p','areaId':None,'goalIds':['g'],'tagIds':['tag'],'plannedDate':'2026-10-24','plannedTime':'08:00','dueDate':'2026-10-27','dueTime':'17:00','reminderAt':'2026-10-25T08:30:00Z','recurrence':{'frequency':'weekly','interval':2},'isCompleted':True,'subtasks':[{'id':'sub','title':'Source child','isCompleted':True}],'attachmentIds':['file']}]
                    seed['goals']=[{'id':'g','title':'Source goal','areaId':'a','status':'active','currentValue':70,'targetValue':100,'progressMode':'manual','targetDate':'2026-10-27','projectLinks':[{'projectId':'p','contributionMode':'selectedTasks','selectedTaskIds':['t']}],'taskIds':['t'],'habitLinks':[{'habitId':'h','metric':'streak','target':30}],'milestones':[{'id':'m','title':'Beta','date':'2026-10-23','isCompleted':True,'completedAt':'2026-10-23T10:00:00Z'}]}]
                    seed['tasks'][0]['completedAt']='2026-10-24T09:00:00Z'
                    seed['habits']=[{'id':'h','name':'Source habit','areaId':'a','goalIds':['g'],'status':'paused','startDate':'2026-09-01','trackingType':'numeric','targetValue':2,'quickValues':[0.5],'frequencyType':'daily','endType':'date','endDate':'2026-11-10','reminders':[{'id':'r','time':'18:00','enabled':True}],'reminderFiredMoments':['old'],'pauseIntervals':[{'startDate':'2026-09-20','endDate':'2026-10-20'}]}]
                    page.evaluate('s=>localStorage.setItem("todoAppData",JSON.stringify(s))',seed)
                    # A real attachment must exist before native migration validates refs.
                    page.add_script_tag(url=url.replace('/index.html','/js/storage.js'))
                    page.evaluate("async()=>TodoStorage.attachments.put({id:'file',taskId:'t',name:'source.txt',size:6,type:'text/plain',blob:new Blob(['source'],{type:'text/plain'})})")
                    page.goto(url)
                    def ready():
                        page.wait_for_function('window.TodoApp && TodoApp.ready')
                        page.evaluate('()=>TodoApp.ready')
                        assert page.evaluate('TodoApp.state !== null'), page.locator('#main').inner_text()
                        page.wait_for_selector('.page-title')
                    ready()
                    assert page.evaluate('window.__TODO_TEST_MEMORY_DB__ === undefined')
                    assert page.locator('link[href="css/styles.css"]').count()==1
                    page.evaluate("async()=>{await TodoStorage.habitLogs.put({id:'h:2026-10-23',habitId:'h',date:'2026-10-23',status:'done',value:2});await TodoStorage.goalHistory.put({id:'old-history',goalId:'g',type:'progressChanged',createdAt:'2026-10-23T12:00:00Z'});await TodoApp.refreshHabitMetrics();}")
                    def route(value):
                        page.evaluate('v=>new Promise(resolve=>{if(location.hash==="#"+v){TodoApp.render();resolve();}else{window.addEventListener("hashchange",()=>resolve(),{once:true});location.hash="#"+v;}})', value)
                    def click(action):
                        page.locator(f'[data-action="{action}"]').first.click()
                    def field(path, value):
                        # The editor queues name autofocus; observe that queued frame
                        # completing before keyboard-backed fill targets another field.
                        page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(resolve))')
                        control=page.locator(f'[data-template-field="{path}"]')
                        control.fill(str(value))
                        assert control.input_value()==str(value)
                    def persisted(expr):
                        try:
                            page.wait_for_function('JSON.parse(localStorage.getItem("todoAppData"))'+expr)
                        except Exception:
                            print('Persistence failure:',expr,page.evaluate('({route:location.hash,templates:TodoApp.state?.templates?.map(t=>({id:t.id,name:t.name})),toast:document.querySelector("#toast-root").innerText,modal:document.querySelector("#modal-root").innerText})'))
                            raise
                    if '--task10-only' in sys.argv:
                        saved_views_and_shortcuts(page,ready,route,click,persisted)
                        assert not errors, errors
                        return
                    # All four real source menus save snapshots into type-specific editors.
                    for kind, entity_route, action, ident in [('task','completed','task-menu','t'),('project','project/p','project-menu','p'),('habit','habit/h','habit-menu','h'),('goal','goal/g','goal-menu','g')]:
                        route(entity_route)
                        page.locator(f'[data-action="{action}"][data-{kind}-id="{ident}"]').first.click()
                        page.locator('[data-pop-action="save-template"]').click()
                        page.fill('#template-name',f'{kind} kit')
                        click('save-template')
                        persisted(f'.templates.some(t=>t.name==="{kind} kit")')
                    snapshots=page.evaluate('JSON.stringify(TodoApp.state.templates)')
                    for route_name, create, input_id in [('goals','new-goal','goal-title'),('habits','new-habit','habit-name')]:
                        route(route_name);click(create);page.fill('#'+input_id,'Keep creation draft');click('from-template');page.keyboard.press('Escape');assert page.locator('#'+input_id).input_value()=='Keep creation draft';click('close-modal')
                    route('project/p'); click('project-menu');page.locator('[data-pop-action="edit-project"]').click()
                    page.fill('#project-name','Changed source');click('save-project')
                    route('habit/h');click('edit-habit');page.fill('#habit-name','Changed habit');click('save-habit')
                    page.wait_for_function('!document.querySelector("#habit-name")')
                    route('goal/g');click('edit-goal-links');page.locator('[data-goal-project-mode="p"]').select_option('allTasks');page.locator('[data-goal-habit-target="h"]').fill('2');click('save-goal-links')
                    assert page.evaluate('JSON.stringify(TodoApp.state.templates)')==snapshots
                    print('PASS: save all four types and source-edit snapshot independence')
                    route('templates')
                    assert page.locator('[data-template-type]').count()==4
                    page.locator('[data-template-type="task"]').click()
                    # Author, edit, duplicate, cancel delete, confirm delete and durable Undo.
                    click('new-template'); page.fill('#template-name','Task authored');field('title','Authored task');field('plannedOffsetDays',0);field('dueOffsetDays',1.5);click('save-template');assert page.locator('#template-name').count()==1;assert page.locator('.validation').count()==1;field('dueOffsetDays',3);click('save-template')
                    row=page.locator('[data-template-row]').filter(has_text='Task authored')
                    row.locator('[data-action="edit-template"]').click();field('notes','Edited notes');click('save-template')
                    row.locator('[data-action="duplicate-template"]').click()
                    persisted('.templates.some(t=>t.name==="Task authored copy")')
                    copy=page.locator('[data-template-row]').filter(has_text='Task authored copy')
                    copy.locator('[data-action="delete-template"]').click();click('close-modal')
                    assert copy.count()==1
                    copy.locator('[data-action="delete-template"]').click();click('confirm-action');persisted('.templates.every(t=>t.name!=="Task authored copy")');click('undo');persisted('.templates.some(t=>t.name==="Task authored copy")')
                    print('PASS: template author/edit/duplicate/confirmation/Undo')
                    def choose(kind, name, creation_action):
                        click(creation_action);click('from-template')
                        page.locator('[data-action="choose-template"]').filter(has_text=name).click()
                    # Native creation flows apply template drafts; no runtime cloning.
                    route('today'); choose('task','task kit','quick-add');page.fill('#quick-title','New task');click('create-task');persisted('.tasks.some(t=>t.title==="New task")')
                    route('today');choose('project','project kit','new-project');page.fill('#project-name','New project');click('save-project');persisted('.projects.some(p=>p.name==="New project")')
                    route('habits');choose('habit','habit kit','new-habit');page.fill('#habit-name','New habit');click('save-habit');page.wait_for_function('!document.querySelector("#habit-name")');persisted('.habits.some(h=>h.name==="New habit")')
                    route('goals');choose('goal','goal kit','new-goal');page.fill('#goal-title','New goal');click('save-goal');persisted('.goals.some(g=>g.title==="New goal")')
                    data=page.evaluate('TodoApp.state')
                    task=next(t for t in data['tasks'] if t['title']=='New task');project=next(x for x in data['projects'] if x['name']=='New project');child=next(t for t in data['tasks'] if t['projectId']==project['id']);habit=next(h for h in data['habits'] if h['name']=='New habit');goal=next(g for g in data['goals'] if g['title']=='New goal')
                    for t in [task,child]:
                        assert t['id']!='t' and not t['isCompleted'] and t['attachmentIds']==[] and t['areaId'] is None
                        assert t['subtasks'][0]['id']!='sub' and not t['subtasks'][0]['isCompleted']
                        assert t['plannedTime']=='08:00' and t['dueTime']=='17:00' and t['plannedDate']=='2026-10-24' and t['dueDate']=='2026-10-27'
                    assert child['id']!=task['id'] and child['subtasks'][0]['id']!=task['subtasks'][0]['id']
                    source_goal=next(g for g in data['goals'] if g['id']=='g')
                    project_link=next(l for l in source_goal['projectLinks'] if l['projectId']==project['id']);assert project_link['contributionMode']=='selectedTasks' and project_link['selectedTaskIds']==[child['id']]
                    habit_link=next(l for l in source_goal['habitLinks'] if l['habitId']==habit['id']);assert habit_link['metric']=='streak' and habit_link['target']==30
                    assert habit['status']=='active' and habit['startDate']=='2026-10-24' and habit['reminderFiredMoments']==[] and habit.get('pauseIntervals',[])==[]
                    assert goal['currentValue']==0 and goal['status']=='active' and goal['projectLinks']==goal['taskIds']==goal['habitLinks']==[]
                    assert goal['milestones'][0]['id']!='m' and not goal['milestones'][0]['isCompleted'] and goal['milestones'][0]['date']=='2026-10-23'
                    assert page.evaluate('id=>TodoStorage.habitLogs.listByHabit(id)',habit['id'])==[]
                    page.wait_for_function('async id=>(await TodoStorage.goalHistory.listByGoal(id)).length===1',arg=goal['id'])
                    history=page.evaluate('id=>TodoStorage.goalHistory.listByGoal(id)',goal['id']);assert history[0]['type']=='created' and history[0]['id']!='old-history'
                    assert page.evaluate('TodoCore.validateStateV3(JSON.parse(localStorage.getItem("todoAppData"))).ok')
                    page.reload();ready()
                    assert page.evaluate('id=>TodoStorage.habitLogs.listByHabit(id)',habit['id'])==[]
                    assert len(page.evaluate('id=>TodoStorage.habitLogs.listByHabit(id)','h'))==1
                    assert len(page.evaluate('id=>TodoStorage.goalHistory.listByGoal(id)',goal['id']))==1
                    print('PASS: four normal creation flows, fresh nested IDs, native history exclusions and reload persistence')
                    # Calendar optional dates remain the instantiation context for all dated flows.
                    for kind, name, save_action, input_id in [('task','task kit','create-task','quick-title'),('goal','goal kit','save-goal','goal-title'),('habit','habit kit','save-habit','habit-name')]:
                        route('calendar');page.locator('[data-action="calendar-view"][data-view="month"]').click();page.locator('[data-action="calendar-detail"][data-date="2026-10-26"]').click();click(f'calendar-new-{kind}');click('from-template');page.locator('[data-action="choose-template"]').filter(has_text=name).click();page.fill('#'+input_id,'Calendar '+kind);click(save_action)
                        persisted(f'.{dict(task="tasks",goal="goals",habit="habits")[kind]}.some(x=>(x.title||x.name)==="Calendar {kind}")')
                    assert page.evaluate('TodoApp.state.tasks.find(t=>t.title==="Calendar task").dueDate')=='2026-10-29'
                    assert page.evaluate('TodoApp.state.goals.find(g=>g.title==="Calendar goal").targetDate')=='2026-10-29'
                    assert page.evaluate('TodoApp.state.habits.find(h=>h.name==="Calendar habit").startDate')=='2026-10-26'
                    # All-type editor CRUD, nested editor delete draft recovery.
                    route('templates')
                    for kind in ['project','habit','goal']:
                        page.locator(f'[data-template-type="{kind}"]').click();click('new-template');page.fill('#template-name',f'{kind} authored');field('name' if kind!='goal' else 'title',f'Authored {kind}');click('save-template')
                        row=page.locator('[data-template-row]').filter(has_text=f'{kind} authored');row.locator('[data-action="edit-template"]').click();field('name' if kind!='goal' else 'title',f'Edited {kind}');click('save-template');row.locator('[data-action="duplicate-template"]').click()
                        copy=page.locator('[data-template-row]').filter(has_text=f'{kind} authored copy');copy.locator('[data-action="delete-template"]').click();click('confirm-action');persisted(f'.templates.every(t=>t.name!=="{kind} authored copy")');click('undo');persisted(f'.templates.some(t=>t.name==="{kind} authored copy")')
                    page.locator('[data-template-type="goal"]').click();page.locator('[data-template-row]').filter(has_text='goal kit').locator('[data-action="edit-template"]').click();field('title','Draft preserved');click('template-remove-row');click('confirm-action');click('undo');assert page.locator('[data-template-field="title"]').input_value()=='Draft preserved';assert page.locator('[data-template-field="milestones.0.title"]').input_value()=='Beta';click('close-modal')
                    page.locator('[data-template-row]').filter(has_text='goal kit').locator('[data-action="edit-template"]').click();click('template-remove-row');click('confirm-action');click('save-template');click('undo');page.locator('[data-template-row]').filter(has_text='goal kit').locator('[data-action="edit-template"]').click();assert page.locator('[data-template-field="milestones.0.title"]').count()==1;click('close-modal')
                    # Deleting a selected predefined child must never select its replacement.
                    page.locator('[data-template-type="project"]').click();page.locator('[data-template-row]').filter(has_text='project kit').locator('[data-action="edit-template"]').click();page.locator('[data-action="template-remove-row"][data-path="tasks"]').click();click('confirm-action');page.locator('[data-action="template-add-row"][data-path="tasks"]').click();field('tasks.0.title','Replacement child');click('save-template')
                    route('today');choose('project','project kit','new-project');page.fill('#project-name','Replacement project');click('save-project');persisted('.projects.some(p=>p.name==="Replacement project")')
                    replacement=page.evaluate('TodoApp.state.projects.find(p=>p.name==="Replacement project").id')
                    assert page.evaluate('id=>TodoApp.state.goals.find(g=>g.id==="g").projectLinks.find(l=>l.projectId===id).selectedTaskIds',replacement)==[]
                    route('templates');page.locator('[data-template-type="habit"]').click();page.locator('[data-template-row]').filter(has_text='habit kit').locator('[data-action="edit-template"]').click();page.locator('[data-template-field="goalLinkConfigs.0.metric"]').select_option('successfulPeriods');field('goalLinkConfigs.0.target',7);click('save-template')
                    route('habits');choose('habit','habit kit','new-habit');page.fill('#habit-name','Edited relation habit');click('save-habit');persisted('.habits.some(h=>h.name==="Edited relation habit")');edited=page.evaluate('TodoApp.state.habits.find(h=>h.name==="Edited relation habit").id');assert page.evaluate('id=>TodoApp.state.goals.find(g=>g.id==="g").habitLinks.find(l=>l.habitId===id)',edited)['target']==7;assert page.evaluate('TodoApp.state.goals.find(g=>g.id==="g").habitLinks.find(l=>l.habitId==="h").target')==2
                    # Remove optional references through normal confirmed deletes; templates survive.
                    route('tags');page.locator('[data-action="tag-menu"]').first.click();page.locator('[data-pop-action="delete-tag"]').click();click('confirm-action');persisted('.tags.length===0')
                    route('area/a');page.locator('[data-action="area-menu"]').first.click();page.locator('[data-pop-action="delete-area"]').click();click('confirm-action');persisted('.areas.length===0')
                    route('goal/g');click('goal-menu');page.locator('[data-pop-action="delete-goal"]').click();click('confirm-action');persisted('.goals.every(g=>g.id!=="g")')
                    route('project/p');click('project-menu');page.locator('[data-pop-action="delete-project"]').click();click('confirm-action');persisted('.projects.every(p=>p.id!=="p")')
                    page.evaluate("__setNow('2026-10-25T12:00:00')")
                    route('today');choose('task','task kit','quick-add');page.fill('#quick-title','Missing refs');click('create-task');persisted('.tasks.some(t=>t.title==="Missing refs")')
                    missing=page.evaluate('TodoApp.state.tasks.find(t=>t.title==="Missing refs")')
                    assert missing['projectId'] is None and missing['areaId'] is None and missing['goalIds']==missing['tagIds']==[]
                    assert missing['plannedDate']=='2026-10-25' and missing['dueDate']=='2026-10-28'
                    assert page.evaluate('v=>new Date(v).getHours()',missing['reminderAt'])==9
                    assert page.evaluate('v=>TodoCore.dateOnly(new Date(v))',missing['reminderAt'])=='2026-10-26'
                    route('templates');page.locator('[data-template-type="task"]').click();page.locator('[data-template-row]').filter(has_text='task kit').locator('[data-action="delete-template"]').click();click('confirm-action');persisted('.templates.every(t=>t.name!=="task kit")');assert page.evaluate('TodoApp.state.tasks.some(t=>t.title==="Missing refs")')
                    page.reload();ready();assert page.evaluate('TodoCore.validateStateV3(JSON.parse(localStorage.getItem("todoAppData"))).ok')
                    assert not errors, errors
                    print('PASS: all-type CRUD, nested draft Undo, missing references, DST wall time, relative rebasing and instance independence')
                    saved_views_and_shortcuts(page,ready,route,click,persisted)
                    recurrence_context=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Europe/Belgrade')
                    try:
                        recurrence_context.add_init_script("""{const NativeDate=Date;let current=new NativeDate('2026-10-24T12:00:00').getTime();window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[current]));}static now(){return current;}};window.__setNow=value=>{current=new NativeDate(value).getTime();};}""")
                        page=recurrence_context.new_page();page.set_default_timeout(5000);page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url);ready()
                        recurrence_workflows(page,ready,route,click,persisted)
                    finally:
                        recurrence_context.close()
                    assert not errors, errors
                finally:
                    context.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__=='__main__':
    main()
