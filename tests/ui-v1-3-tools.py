"""Templates: real static UI, disposable HTTP origin, native growing stores."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


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
                        page.locator(f'[data-template-field="{path}"]').fill(str(value))
                    def persisted(expr):
                        page.wait_for_function('JSON.parse(localStorage.getItem("todoAppData"))'+expr)
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
