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
MODULES = [(ROOT / 'js' / name).read_text() for name in ('domain-modules.js', 'knowledge.js', 'goals-ui.js', 'habits-ui.js', 'saved-views-ui.js', 'projects-ui.js', 'areas-ui.js', 'settings-ui.js', 'templates-ui.js', 'calendar-ui.js', 'tasks-ui.js', 'cleaning-ui.js')]
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
    for script in [JSZIP, CORE, STORAGE, ATTACHMENTS, BACKUP, *MODULES, APP]:
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

        # Goal CRUD starts with a manual source and keeps completion user-controlled.
        page.click('[data-route="goals"]')
        page.click('[data-action="new-goal"]')
        page.fill('#goal-title', 'Launch V1')
        page.fill('#goal-current', '50')
        page.click('[data-action="save-goal"]')
        goal = page.evaluate("TodoApp.state.goals.find(g => g.title === 'Launch V1')")
        assert goal['progressMode'] == 'manual' and goal['status'] == 'active'

        # Updating manual progress to 100 asks rather than auto-completing.
        page.fill('#goal-current-value', '100')
        page.click('[data-action="save-goal-progress"]')
        assert page.locator('.modal-title').inner_text() == 'Goal reached'
        page.click('[data-action="keep-goal-active"]')
        assert page.evaluate("id => TodoApp.state.goals.find(g => g.id === id).status", goal['id']) == 'active'

        # Links update both directions and allTasks picks up a growing project scope.
        page.click('[data-action="edit-goal"]')
        page.select_option('#goal-progress-mode', 'linkedTasks')
        page.click('[data-action="save-goal"]')
        page.click('[data-action="edit-goal-links"]')
        page.check(f'[data-goal-link-project="{project["id"]}"]')
        page.click('[data-action="save-goal-links"]')
        linked = page.evaluate("id => TodoApp.state.goals.find(g => g.id === id)", goal['id'])
        assert linked['projectLinks'][0]['contributionMode'] == 'allTasks'
        assert goal['id'] in page.evaluate("id => TodoApp.state.projects.find(p => p.id === id).goalIds", project['id'])
        page.evaluate("id => TodoApp.state.tasks.push({id:'future-project-task', title:'Future project task', projectId:id, areaId:null, goalIds:[], isCompleted:false, subtasks:[]})", project['id'])
        assert page.evaluate("id => TodoCore.computeGoalProgress(TodoApp.state.goals.find(g => g.id === id), TodoApp.state, {}).target", goal['id']) == 2

        # Habit links retain per-link metric/target and contribute equally.
        page.evaluate("""() => { TodoApp.state.habits.push(
          {id:'habit-one', name:'Read', goalIds:[], status:'active'},
          {id:'habit-two', name:'Practice', goalIds:[], status:'active'}
        ); TodoApp.state.habitMetrics={
          'habit-one':{totalCheckins:20,streak:0,successfulPeriods:0},
          'habit-two':{totalCheckins:0,streak:2,successfulPeriods:0}
        }; }""")
        page.click('[data-action="edit-goal"]')
        page.select_option('#goal-progress-mode', 'linkedHabits')
        page.click('[data-action="save-goal"]')
        page.click('[data-action="edit-goal-links"]')
        page.check('[data-goal-link-habit="habit-one"]')
        page.check('[data-goal-link-habit="habit-two"]')
        page.fill('[data-goal-habit-target="habit-one"]', '10')
        page.fill('[data-goal-habit-target="habit-two"]', '5')
        page.select_option('[data-goal-habit-metric="habit-two"]', 'streak')
        page.click('[data-action="save-goal-links"]')
        assert page.evaluate("id => TodoCore.computeGoalProgress(TodoApp.state.goals.find(g => g.id === id), TodoApp.state, TodoApp.state.habitMetrics).percent", goal['id']) == 70

        # Paused targets are never overdue; resuming reevaluates immediately.
        page.evaluate("id => { const g=TodoApp.state.goals.find(g => g.id === id); g.targetDate='2000-01-01'; g.status='paused'; TodoApp.render(); }", goal['id'])
        assert page.evaluate("id => TodoCore.isGoalOverdue(TodoApp.state.goals.find(g => g.id === id), '2026-09-16')", goal['id']) is False
        page.click('[data-action="resume-goal"]')
        assert page.evaluate("id => TodoCore.isGoalOverdue(TodoApp.state.goals.find(g => g.id === id), '2026-09-16')", goal['id']) is True

        # Dated incomplete milestones are calendar-eligible and derive as overdue.
        page.click('[data-action="new-milestone"]')
        page.fill('#milestone-title', 'Ship beta')
        page.fill('#milestone-date', '2000-01-01')
        page.click('[data-action="save-milestone"]')
        assert page.evaluate("id => TodoCore.overdueMilestones(TodoApp.state.goals.find(g => g.id === id), '2026-09-16').length", goal['id']) == 1
        page.click('[data-action="edit-goal-reminders"]')
        page.check('#goal-reminder-7')
        page.fill('#goal-reminder-time', '08:30')
        page.click('[data-action="save-goal-reminders"]')
        assert page.evaluate("id => TodoCore.goalReminderMoments(TodoApp.state.goals.find(g => g.id === id)).length", goal['id']) == 1

        # Creation/progress/status/link events are stored, and delete/Undo restores the Goal.
        history_types = page.evaluate("async id => (await TodoStorage.goalHistory.listByGoal(id)).map(e => e.type)", goal['id'])
        assert 'created' in history_types and 'progressChanged' in history_types and 'projectLinked' in history_types
        page.click('[data-action="goal-menu"]')
        page.click('[data-pop-action="archive-goal"]')
        assert page.evaluate("id => TodoApp.state.goals.find(g => g.id === id).status", goal['id']) == 'archived'
        page.click('[data-route="goals"]')
        page.click('[data-goal-tab="archived"]')
        page.click('[data-action="goal-menu"]')
        page.click('[data-pop-action="restore-goal"]')
        assert page.evaluate("id => TodoApp.state.goals.find(g => g.id === id).status", goal['id']) == 'active'
        page.evaluate("id => { location.hash = '#goal/' + id; TodoApp.render(); }", goal['id'])
        page.click('[data-action="goal-menu"]')
        page.click('[data-pop-action="delete-goal"]')
        page.click('[data-action="confirm-action"]')
        assert page.evaluate("id => TodoApp.state.goals.some(g => g.id === id)", goal['id']) is False
        page.click('[data-action="undo"]')
        assert page.evaluate("id => TodoApp.state.goals.some(g => g.id === id)", goal['id']) is True
        browser.close()


def goal_fix_round_contract():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=chromium_path(), args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        boot(page)
        page.evaluate('''() => {
          const now = new Date();
          const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
          TodoApp.state.projects.push({id:'project-selected',name:'Selected scope',goalIds:[],areaId:null,isArchived:false});
          TodoApp.state.tasks.push(
            {id:'selected-a',title:'Selected A',projectId:'project-selected',areaId:null,goalIds:[],plannedDate:local,isCompleted:false,subtasks:[]},
            {id:'selected-b',title:'Selected B',projectId:'project-selected',areaId:null,goalIds:[],isCompleted:false,subtasks:[]}
          );
          TodoApp.state.goals.push({
            id:'goal-selected',title:'Selected task goal',areaId:null,status:'active',progressMode:'linkedTasks',progressType:'percentage',currentValue:0,targetValue:100,unit:'',targetDate:local,
            projectLinks:[{projectId:'project-selected',contributionMode:'selectedTasks',selectedTaskIds:['selected-a']}],taskIds:[],habitLinks:[],milestones:[{id:'milestone-edit',title:'Before edit',date:local,isCompleted:false,completedAt:null,order:0}],
            reminders:{sevenDaysBefore:false,threeDaysBefore:false,oneDayBefore:false,onTargetDate:true,time:new Date(now.getTime()-60000).toTimeString().slice(0,5)},reminderFiredMoments:[],createdAt:'x',updatedAt:'x',completedAt:null
          });
          location.hash = '#goal/goal-selected'; TodoApp.render();
        }''')

        # selectedTasks exposes its own in-project picker and preserves its selection.
        page.click('[data-action="edit-goal-links"]')
        assert page.locator('[data-goal-project-task="project-selected:selected-a"]').is_checked()
        assert page.locator('[data-goal-project-task="project-selected:selected-b"]').is_checked() is False
        page.check('[data-goal-project-task="project-selected:selected-b"]')
        page.click('[data-action="save-goal-links"]')
        assert page.evaluate("TodoApp.state.goals[0].projectLinks[0].selectedTaskIds.sort()") == ['selected-a', 'selected-b']
        page.click('[data-action="edit-goal-links"]')
        page.click('[data-action="save-goal-links"]')
        assert page.evaluate("TodoApp.state.goals[0].projectLinks[0].selectedTaskIds.sort()") == ['selected-a', 'selected-b']

        # Completing the last linked task prompts; the reusable evaluator also powers link changes.
        page.evaluate("TodoApp.state.goals[0].projectLinks[0].selectedTaskIds=['selected-a']")
        page.evaluate("location.hash='#today'; TodoApp.render()")
        page.click('[data-action="toggle-complete"][data-task-id="selected-a"]')
        assert page.locator('.modal-title').inner_text() == 'Goal reached'
        page.click('[data-action="keep-goal-active"]')

        # Goal reminder delivery records its moment exactly once and is not re-fired.
        page.evaluate("TodoApp.checkReminders()")
        fired = page.evaluate("TodoApp.state.goals[0].reminderFiredMoments")
        assert len(fired) == 1
        page.evaluate("TodoApp.checkReminders()")
        assert page.evaluate("TodoApp.state.goals[0].reminderFiredMoments.length") == 1
        page.evaluate("TodoApp.state.goals[0].targetDate='2000-01-01'; TodoApp.state.goals[0].reminderFiredMoments=[]; TodoApp.checkReminders()")
        assert page.evaluate("TodoApp.state.goals[0].reminderFiredMoments.length") == 0

        # Milestones can be edited without recreating the child record.
        page.evaluate("location.hash='#goal/goal-selected'; TodoApp.render()")
        page.click('[data-action="edit-milestone"][data-milestone-id="milestone-edit"]')
        page.fill('#milestone-title', 'After edit')
        page.click('[data-action="save-milestone"]')
        assert page.evaluate("TodoApp.state.goals[0].milestones[0].title") == 'After edit'
        browser.close()


if __name__ == '__main__':
    main()
    goal_fix_round_contract()
