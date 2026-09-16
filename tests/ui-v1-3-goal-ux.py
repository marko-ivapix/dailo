"""Goal creation/detail contracts on disposable native storage and styled UI."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import sys
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


def seed():
    return {'version': 3, 'tasks': [
        {'id': 't1', 'title': 'Task one', 'projectId': 'p1'},
        {'id': 't2', 'title': 'Task two', 'projectId': 'p2'},
        {'id': 'direct', 'title': 'Direct task'}],
        'projects': [{'id': 'p1', 'name': 'Project one'}, {'id': 'p2', 'name': 'Project two'}],
        'areas': [{'id': 'a1', 'name': 'Business', 'status': 'active'}],
        'goals': [{'id': 'g1', 'title': 'Original goal', 'progressMode': 'manual',
                   'progressType': 'numeric', 'currentValue': 0.5, 'targetValue': 10,
                   'unit': 'L', 'targetDate': '2026-12-20'}],
        'habits': [{'id': 'h1', 'name': 'Habit one', 'status': 'active',
                    'startDate': '2026-09-16', 'frequencyType': 'daily', 'trackingType': 'checkbox'}],
        'tags': [], 'templates': [], 'savedViews': [],
        'settings': {'weekStartsOn': 'monday'}, 'ui': {}}


def ready(page):
    page.wait_for_function('window.TodoApp && window.TodoStorage && TodoApp.ready')
    page.evaluate('() => TodoApp.ready')
    expect(page.locator('.page-title')).to_be_visible()


def goal(page, title=None):
    return page.evaluate('title => TodoApp.state.goals.find(g => title ? g.title === title : g.id === "g1")', title)


def completed_history(page, goal_id, types):
    """Await actual native readback, not the existing detached app write callback."""
    return page.evaluate('''async ({goalId, types}) => {
      const end = performance.now() + 4000;
      while (performance.now() < end) {
        const records = await TodoStorage.goalHistory.listByGoal(goalId);
        if (types.every(type => records.some(record => record.type === type))) return records;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('Native Goal history did not complete');
    }''', {'goalId': goal_id, 'types': types})


def trap(page):
    selectors = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])'
    page.evaluate('s => {const a=[...document.querySelector("#modal-root .modal").querySelectorAll(s)].filter(e=>e.offsetParent!==null);a.at(-1).focus()}', selectors)
    page.keyboard.press('Tab')
    assert page.evaluate('s => document.activeElement === [...document.querySelector("#modal-root .modal").querySelectorAll(s)].filter(e=>e.offsetParent!==null)[0]', selectors)
    page.keyboard.press('Shift+Tab')
    assert page.evaluate('s => document.activeElement === [...document.querySelector("#modal-root .modal").querySelectorAll(s)].filter(e=>e.offsetParent!==null).at(-1)', selectors)


def creation(page):
    page.click('[data-action="new-goal"]')
    expect(page.locator('#goal-title')).to_be_focused()
    page.fill('#goal-title', 'Draft goal')
    page.select_option('#goal-area', 'a1')
    page.fill('#goal-target-date', '2026-12-21')
    page.select_option('#goal-progress-type', 'numeric')
    page.fill('#goal-target', '2.5')
    page.fill('#goal-unit', 'km')
    page.locator('[data-action="toggle-goal-more"]').press('Enter')
    page.click('[data-action="draft-goal-reminders"]')
    expect(page.locator('#goal-reminder-7')).to_be_focused()
    trap(page)
    page.check('#goal-reminder-7')
    page.check('#goal-reminder-date')
    page.fill('#goal-reminder-time', '10:15')
    page.click('[data-action="save-goal-reminders"]')
    expect(page.locator('[data-action="draft-goal-reminders"]')).to_be_focused()
    page.click('[data-action="draft-goal-milestone"]')
    page.fill('#milestone-title', 'Draft milestone')
    page.fill('#milestone-date', '2026-12-19')
    page.click('[data-action="save-milestone"]')
    assert page.evaluate('TodoApp.state.goals.length') == 1
    page.select_option('#goal-progress-mode', 'linkedTasks')
    page.click('[data-action="draft-goal-links"]')
    assert page.locator('[data-goal-link-habit]').count() == 0
    page.check('[data-goal-link-task="direct"]')
    page.check('[data-goal-link-project="p1"]')
    page.select_option('[data-goal-project-mode="p1"]', 'selectedTasks')
    page.check('[data-goal-project-task="p1:t1"]')
    page.select_option('[data-goal-project-mode="p2"]', 'selectedTasks')
    expect(page.locator('[data-goal-project-task="p1:t1"]')).to_be_checked()
    expect(page.locator('[data-goal-link-project="p2"]')).not_to_be_checked()
    page.click('[data-action="save-goal-links"]')
    page.select_option('#goal-progress-mode', 'linkedHabits')
    page.click('[data-action="draft-goal-links"]')
    assert page.locator('[data-goal-link-task]').count() == 0
    page.check('[data-goal-link-habit="h1"]')
    page.select_option('[data-goal-habit-metric="h1"]', 'streak')
    page.fill('[data-goal-habit-target="h1"]', '2.5')
    page.click('[data-action="save-goal-links"]')
    page.select_option('#goal-progress-mode', 'manual')
    expect(page.locator('#goal-target')).to_have_value('2.5')
    expect(page.locator('#goal-title')).to_have_value('Draft goal')
    page.click('[data-action="from-template"]')
    page.keyboard.press('Escape')
    expect(page.locator('[data-action="from-template"]')).to_be_focused()
    expect(page.locator('#goal-target-date')).to_have_value('2026-12-21')
    page.fill('#goal-title', '')
    page.click('[data-action="save-goal"]')
    expect(page.locator('.validation')).to_be_visible()
    assert page.evaluate('TodoApp.state.goals.length') == 1
    page.fill('#goal-title', 'Draft goal')
    page.click('[data-action="toggle-goal-more"]')
    page.click('[data-action="save-goal"]')
    made = goal(page, 'Draft goal')
    expect(page.locator(f'[data-goal-property="title"][data-goal-id="{made["id"]}"]')).to_be_focused()
    assert made['targetValue'] == 2.5 and made['unit'] == 'km' and made['areaId'] == 'a1'
    assert made['taskIds'] == ['direct'] and made['projectLinks'] == [{'projectId': 'p1', 'contributionMode': 'selectedTasks', 'selectedTaskIds': ['t1']}]
    assert made['habitLinks'] == [{'habitId': 'h1', 'metric': 'streak', 'target': 2.5}]
    assert made['milestones'][0]['title'] == 'Draft milestone' and made['milestones'][0]['date'] == '2026-12-19'
    assert made['reminders'] == {'sevenDaysBefore': True, 'threeDaysBefore': False, 'oneDayBefore': False, 'onTargetDate': True, 'time': '10:15'}
    assert page.evaluate('id => [TodoApp.state.tasks.find(t=>t.id==="direct").goalIds, TodoApp.state.projects[0].goalIds, TodoApp.state.habits[0].goalIds].every(a=>a.includes(id))', made['id'])
    history = completed_history(page, made['id'], ['created'])
    assert len(history) == 1 and history[0]['type'] == 'created' and history[0]['data'] == {}
    page.reload(wait_until='domcontentloaded'); ready(page)
    assert goal(page, 'Draft goal') == {**made, 'reminderFiredMoments': []}, (made, goal(page, 'Draft goal'))
    assert page.evaluate('id => TodoStorage.goalHistory.listByGoal(id)', made['id']) == history


def detail(page):
    page.click('[data-route="goal/g1"]')
    for field, value, selector in [('title', 'Renamed goal', '#goal-detail-title'), ('areaId', 'a1', '#goal-detail-areaId'), ('targetValue', '2.5', '#goal-detail-targetValue'), ('unit', 'km', '#goal-detail-unit'), ('targetDate', '2026-12-22', '#goal-detail-targetDate')]:
        trigger = page.locator(f'[data-goal-property="{field}"]')
        trigger.press('Enter')
        expect(page.locator(selector)).to_be_focused()
        if field == 'areaId': page.select_option(selector, value)
        else: page.fill(selector, value)
        if field == 'title':
            page.evaluate('TodoApp.render()')
            expect(page.locator(selector)).to_have_value(value)
        page.locator(selector).press('Control+f')
        assert page.locator('#search-input').count() == 0
        page.click('[data-action="save-goal-property"]')
        expect(page.locator(f'[data-goal-property="{field}"]')).to_be_focused()
        assert goal(page)[field] == (2.5 if field == 'targetValue' else value)
        page.locator(f'[data-goal-property="{field}"]').press('Enter')
        if field == 'areaId': page.select_option(selector, '')
        else: page.fill(selector, '0' if field == 'targetValue' else 'Canceled' if field in ['title', 'unit'] else '2026-12-25')
        page.keyboard.press('Escape')
        expect(page.locator(f'[data-goal-property="{field}"]')).to_be_focused()
        assert goal(page)[field] == (2.5 if field == 'targetValue' else value)
    page.click('[data-goal-property="targetValue"]'); page.fill('#goal-detail-targetValue', '0')
    page.click('[data-action="save-goal-property"]')
    expect(page.locator('.validation')).to_be_visible()
    assert goal(page)['targetValue'] == 2.5
    page.keyboard.press('Escape')
    page.click('[data-action="edit-goal-source"]')
    expect(page.locator('#goal-progress-mode')).to_be_focused(); trap(page)
    page.select_option('#goal-progress-mode', 'linkedTasks')
    page.click('[data-action="save-goal-source"]')
    assert goal(page)['progressMode'] == 'linkedTasks' and goal(page)['currentValue'] == 0.5
    page.click('[data-action="goal-status-menu"]')
    page.click('[data-pop-action="pause-goal"]')
    assert goal(page)['status'] == 'paused'
    page.reload(wait_until='domcontentloaded'); ready(page)
    g = goal(page)
    assert g['title'] == 'Renamed goal' and g['targetValue'] == 2.5 and g['targetDate'] == '2026-12-22' and g['status'] == 'paused'
    history = page.evaluate('() => TodoStorage.goalHistory.listByGoal("g1")')
    assert sum(e['type'] == 'targetDateChanged' for e in history) == 1


def links(page, check_focus=True):
    page.click('[data-route="goal/g1"]'); page.click('[data-action="edit-goal-links"]')
    if check_focus: expect(page.locator('[data-goal-link-project="p1"]')).to_be_focused()
    page.check('[data-goal-link-project="p1"]'); page.check('[data-goal-link-task="direct"]')
    page.check('[data-goal-link-habit="h1"]'); page.fill('[data-goal-habit-target="h1"]', '2.5')
    page.select_option('[data-goal-habit-metric="h1"]', 'streak')
    page.select_option('[data-goal-project-mode="p2"]', 'selectedTasks')
    expect(page.locator('[data-goal-link-project="p1"]')).to_be_checked()
    expect(page.locator('[data-goal-link-project="p2"]')).not_to_be_checked()
    expect(page.locator('[data-goal-link-task="direct"]')).to_be_checked()
    expect(page.locator('[data-goal-habit-target="h1"]')).to_have_value('2.5')
    page.keyboard.press('Escape')
    expect(page.locator('[data-action="edit-goal-links"]')).to_be_focused()
    assert goal(page)['projectLinks'] == [] and goal(page)['taskIds'] == [] and goal(page)['habitLinks'] == []


def panels(page):
    page.click('[data-route="goal/g1"]')
    before = goal(page)
    page.click('[data-action="new-milestone"]')
    expect(page.locator('#milestone-title')).to_be_focused(); trap(page)
    page.fill('#milestone-date', '2026-12-18')
    page.click('[data-action="save-milestone"]')
    expect(page.locator('.validation')).to_be_visible()
    expect(page.locator('#milestone-date')).to_have_value('2026-12-18')
    page.fill('#milestone-title', 'Native milestone'); page.click('[data-action="save-milestone"]')
    expect(page.locator('[data-action="new-milestone"]')).to_be_focused()
    milestone = goal(page)['milestones'][0]
    page.click('[data-action="edit-milestone"]'); page.fill('#milestone-title', 'Canceled')
    page.keyboard.press('Escape'); assert goal(page)['milestones'][0] == milestone
    page.click('[data-action="edit-goal-reminders"]')
    expect(page.locator('#goal-reminder-7')).to_be_focused(); trap(page)
    for key in ['7', '3', '1', 'date']: page.check('#goal-reminder-' + key)
    page.fill('#goal-reminder-time', '10:15'); page.click('[data-action="save-goal-reminders"]')
    expect(page.locator('[data-action="edit-goal-reminders"]')).to_be_focused()
    reminders = goal(page)['reminders']
    page.click('[data-action="edit-goal-reminders"]'); page.uncheck('#goal-reminder-7'); page.keyboard.press('Escape')
    assert goal(page)['reminders'] == reminders
    page.click('[data-action="edit-goal-links"]'); page.check('[data-goal-link-habit="h1"]')
    page.fill('[data-goal-habit-target="h1"]', '0'); page.click('[data-action="save-goal-links"]')
    expect(page.locator('.validation')).to_be_visible(); assert goal(page)['habitLinks'] == []
    page.fill('[data-goal-habit-target="h1"]', '0.25'); page.check('[data-goal-link-project="p1"]'); page.check('[data-goal-link-task="direct"]')
    page.click('[data-action="save-goal-links"]')
    linked = goal(page)
    page.click('[data-action="edit-goal-source"]'); page.select_option('#goal-progress-mode', 'linkedHabits'); page.keyboard.press('Escape')
    assert goal(page)['progressMode'] == 'manual' and goal(page)['habitLinks'] == linked['habitLinks']
    page.reload(wait_until='domcontentloaded'); ready(page)
    g = goal(page); assert g['reminders'] == reminders and g['milestones'] == [milestone] and g['habitLinks'][0]['target'] == 0.25
    assert g['projectLinks'] == linked['projectLinks'] and g['taskIds'] == ['direct'] and g['currentValue'] == before['currentValue']
    page.click('[data-action="delete-milestone"]'); page.keyboard.press('Escape'); assert goal(page)['milestones'] == [milestone]
    page.click('[data-action="delete-milestone"]'); page.click('[data-action="confirm-action"]')
    page.wait_for_function('TodoApp.state.goals[0].milestones.length === 0')
    page.click('[data-action="undo"]'); page.wait_for_function('TodoApp.state.goals[0].milestones.length === 1')
    assert goal(page)['milestones'] == [milestone]


def cancel_context(page):
    page.click('[data-action="new-goal"]'); page.fill('#goal-title', 'Canceled parent')
    page.click('[data-action="toggle-goal-more"]'); page.click('[data-action="draft-goal-milestone"]')
    page.fill('#milestone-title', 'Never created'); page.keyboard.press('Escape')
    expect(page.locator('#goal-title')).to_have_value('Canceled parent')
    assert page.evaluate('TodoApp.state.goals.length') == 1
    page.click('[data-action="draft-goal-links"]'); page.check('[data-goal-link-project="p1"]'); page.click('[data-action="save-goal-links"]')
    page.keyboard.press('Escape'); expect(page.locator('[data-action="new-goal"]')).to_be_focused()
    assert page.evaluate('TodoApp.state.projects.every(p=>p.goalIds.length===0)')
    page.click('[data-route="areas"]'); page.click('[data-route="area/a1"]'); page.click('[data-action="area-new-goal"]')
    expect(page.locator('#goal-area')).to_have_value('a1'); page.fill('#goal-title', 'Area goal')
    page.click('[data-action="toggle-goal-more"]'); page.click('[data-action="toggle-goal-more"]'); page.click('[data-action="save-goal"]')
    assert goal(page, 'Area goal')['areaId'] == 'a1'
    page.click('[data-route="calendar"]'); page.locator('[data-action="calendar-detail"][data-date]').first.click()
    date = page.locator('[data-action="calendar-new-goal"]').get_attribute('data-date')
    page.click('[data-action="calendar-new-goal"]'); page.fill('#goal-title', 'Calendar goal')
    page.click('[data-action="toggle-goal-more"]'); page.click('[data-action="save-goal"]')
    assert goal(page, 'Calendar goal')['targetDate'] == date
    page.reload(wait_until='domcontentloaded'); ready(page)
    assert goal(page, 'Area goal')['areaId'] == 'a1' and goal(page, 'Calendar goal')['targetDate'] == date


def draft_delete(page):
    page.click('[data-action="new-goal"]'); page.fill('#goal-title', 'Undo draft goal')
    page.click('[data-action="toggle-goal-more"]'); page.click('[data-action="draft-goal-milestone"]')
    page.fill('#milestone-title', 'Restore draft child'); page.fill('#milestone-date', '2026-12-17'); page.click('[data-action="save-milestone"]')
    page.locator('[data-action="draft-goal-milestone"]').first.wait_for()
    page.click('[data-action="delete-draft-goal-milestone"]'); page.keyboard.press('Escape')
    expect(page.locator('[data-action="delete-draft-goal-milestone"]')).to_be_visible()
    page.click('[data-action="delete-draft-goal-milestone"]'); page.click('[data-action="confirm-action"]')
    expect(page.locator('[data-action="delete-draft-goal-milestone"]')).to_have_count(0)
    page.click('[data-action="save-goal"]'); page.click('[data-action="undo"]')
    page.wait_for_function('TodoApp.state.goals.find(g=>g.title==="Undo draft goal").milestones.length===1')
    restored = goal(page, 'Undo draft goal')['milestones']
    assert restored[0]['title'] == 'Restore draft child' and restored[0]['date'] == '2026-12-17'
    page.reload(wait_until='domcontentloaded'); ready(page)
    assert goal(page, 'Undo draft goal')['milestones'] == restored


def link_toggle(page):
    page.click('[data-route="goal/g1"]'); page.click('[data-action="edit-goal-links"]')
    page.check('[data-goal-link-project="p1"]'); page.select_option('[data-goal-project-mode="p1"]', 'selectedTasks')
    page.check('[data-goal-project-task="p1:t1"]'); page.uncheck('[data-goal-link-project="p1"]')
    page.check('[data-goal-link-habit="h1"]'); page.select_option('[data-goal-habit-metric="h1"]', 'streak'); page.fill('[data-goal-habit-target="h1"]', '0.25')
    page.uncheck('[data-goal-link-habit="h1"]'); page.select_option('[data-goal-project-mode="p2"]', 'selectedTasks')
    page.check('[data-goal-link-project="p1"]'); page.check('[data-goal-link-habit="h1"]')
    expect(page.locator('[data-goal-project-task="p1:t1"]')).to_be_checked()
    expect(page.locator('[data-goal-habit-metric="h1"]')).to_have_value('streak')
    expect(page.locator('[data-goal-habit-target="h1"]')).to_have_value('0.25')


def empty_links(page):
    page.click('[data-route="goal/g1"]'); page.click('[data-action="edit-goal-links"]')
    expect(page.locator('#modal-root').get_by_role('button', name='Cancel', exact=True)).to_be_focused()
    trap(page); page.keyboard.press('Escape')
    expect(page.locator('[data-action="edit-goal-links"]')).to_be_focused()


def visual(page):
    page.click('[data-route="goal/g1"]')
    page.screenshot(path='/private/tmp/task14a-goal-desktop.png', animations='disabled')
    page.set_viewport_size({'width': 600, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path='/private/tmp/task14a-goal-mobile.png', animations='disabled')
    page.click('[data-action="edit-goal"]'); page.click('[data-action="toggle-goal-more"]')
    assert page.evaluate('document.querySelector(".modal").scrollWidth <= document.querySelector(".modal").clientWidth')
    page.screenshot(path='/private/tmp/task14a-goal-more.png', animations='disabled')


def populated_preview(page):
    title = 'Prepare a complete milestone preview with a deliberately long readable title'
    page.click('[data-action="new-goal"]'); page.fill('#goal-title', 'Populated preview goal')
    page.click('[data-action="toggle-goal-more"]'); page.click('[data-action="draft-goal-milestone"]')
    page.fill('#milestone-title', title); page.fill('#milestone-date', '2026-12-19')
    page.click('[data-action="save-milestone"]')
    row = page.locator('#goal-more .milestone-row')
    for width in [1440, 600]:
        page.set_viewport_size({'width': width, 'height': 1000})
        expect(row.locator('strong')).to_have_text(title)
        expect(row.get_by_role('button', name='Edit milestone', exact=True)).to_be_visible()
        expect(row.get_by_role('button', name='Delete milestone', exact=True)).to_be_visible()
        geometry = row.evaluate("""row => {
          const boxes = [...row.children].map(e => {const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}});
          const text = row.querySelector('strong');
          return {columns:getComputedStyle(row).gridTemplateColumns, boxes,
            textOverflow:text.scrollWidth > text.clientWidth,
            overflow:row.scrollWidth > row.clientWidth};
        }""")
        assert geometry['boxes'][0]['width'] > 150, geometry
        assert not geometry['textOverflow'] and not geometry['overflow'], geometry
        assert all(a['right'] <= b['left'] for a,b in zip(geometry['boxes'], geometry['boxes'][1:])), geometry
        page.screenshot(path=f'/private/tmp/task14a-goal-populated-{width}.png', animations='disabled')
    page.click('[data-action="save-goal"]')
    made = goal(page, 'Populated preview goal')
    assert made['milestones'][0]['title'] == title
    detail = page.locator('#main .milestone-row')
    for width in [1440, 600]:
        page.set_viewport_size({'width': width, 'height': 1000})
        geometry = detail.evaluate("""row => ({children:row.children.length,
          firstWidth:row.firstElementChild.getBoundingClientRect().width,
          columns:getComputedStyle(row).gridTemplateColumns,
          draftModifier:row.classList.contains('goal-draft-milestone')})""")
        assert geometry['children'] == 4 and geometry['firstWidth'] == 32 and not geometry['draftModifier'], geometry
        expect(detail.locator('strong')).to_have_text(title)
    page.reload(wait_until='domcontentloaded'); ready(page)
    assert goal(page, 'Populated preview goal')['milestones'] == made['milestones']


def template_context(page):
    page.click('[data-route="calendar"]'); page.locator('[data-action="calendar-detail"][data-date]').first.click()
    selected = page.locator('[data-action="calendar-new-goal"]').get_attribute('data-date')
    page.click('[data-action="calendar-new-goal"]'); page.click('[data-action="from-template"]')
    page.click('[data-action="choose-template"][data-template-id="gt"]')
    expect(page.locator('#goal-title')).to_have_value('Recipe goal')
    target = (date.fromisoformat(selected) + timedelta(days=3)).isoformat()
    expect(page.locator('#goal-target-date')).to_have_value(target)
    page.click('[data-action="toggle-goal-more"]'); page.click('[data-action="draft-goal-reminders"]')
    expect(page.locator('#goal-reminder-3')).to_be_checked(); page.keyboard.press('Escape')
    page.click('[data-action="toggle-goal-more"]'); page.click('[data-action="save-goal"]')
    made = goal(page, 'Recipe goal')
    assert made['targetValue'] == 2.5 and made['targetDate'] == target and made['projectLinks'] == [] and made['taskIds'] == [] and made['habitLinks'] == []
    assert made['milestones'][0]['title'] == 'Recipe child' and made['milestones'][0]['date'] == (date.fromisoformat(selected) + timedelta(days=1)).isoformat()
    assert made['reminders']['threeDaysBefore'] and made['reminders']['time'] == '11:30'
    page.reload(wait_until='domcontentloaded'); ready(page)
    assert goal(page, 'Recipe goal')['milestones'] == made['milestones']


def multi_link(page):
    page.click('[data-route="goal/g1"]'); page.click('[data-action="edit-goal-links"]')
    page.check('[data-goal-link-project="p1"]'); page.check('[data-goal-link-task="direct"]'); page.check('[data-goal-link-habit="h1"]')
    page.fill('[data-goal-habit-target="h1"]', '0.25'); page.click('[data-action="save-goal-links"]')
    assert page.evaluate('[TodoApp.state.projects[0],TodoApp.state.tasks[2],TodoApp.state.habits[0]].every(o=>o.goalIds.includes("g1")&&o.goalIds.includes("g2"))')
    page.click('[data-action="edit-goal"]'); page.click('[data-action="toggle-goal-more"]'); page.click('[data-action="draft-goal-links"]')
    page.uncheck('[data-goal-link-project="p1"]'); page.click('[data-action="save-goal-links"]'); page.click('[data-action="save-goal"]')
    assert page.evaluate('TodoApp.state.projects[0].goalIds.length===1 && TodoApp.state.projects[0].goalIds[0]==="g2"')
    assert goal(page)['taskIds'] == ['direct'] and goal(page)['habitLinks'][0]['target'] == 0.25
    before_reload = completed_history(page, 'g1', ['projectLinked', 'projectUnlinked'])
    assert sum(e['type'] == 'projectLinked' for e in before_reload) == 1 and sum(e['type'] == 'projectUnlinked' for e in before_reload) == 1, before_reload
    assert all(e['data'] == {'projectId': 'p1'} for e in before_reload if e['type'] in ['projectLinked', 'projectUnlinked'])
    page.reload(wait_until='domcontentloaded'); ready(page)
    assert page.evaluate('[TodoApp.state.tasks[2],TodoApp.state.habits[0]].every(o=>o.goalIds.includes("g1")&&o.goalIds.includes("g2"))')
    history = page.evaluate('() => TodoStorage.goalHistory.listByGoal("g1")')
    assert sum(e['type'] == 'projectLinked' for e in history) == 1 and sum(e['type'] == 'projectUnlinked' for e in history) == 1, history
    assert history == before_reload


def main():
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *_args): pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    count = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
            try:
                cases = {'creation': creation, 'detail': detail, 'links': links, 'links-draft': lambda page: links(page, False), 'panels': panels, 'cancel-context': cancel_context, 'draft-delete': draft_delete, 'link-toggle': link_toggle, 'empty-links': empty_links, 'visual': visual, 'populated-preview': populated_preview, 'template-context': template_context, 'multi-link': multi_link}
                for name in sys.argv[1:] or cases:
                    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
                    try:
                        page = context.new_page(); page.set_default_timeout(4000); page.set_default_navigation_timeout(15000)
                        url = f'http://127.0.0.1:{server.server_port}'
                        page.goto(url + '/vendor/', wait_until='domcontentloaded')
                        initial = seed()
                        if name == 'empty-links':
                            initial['tasks'] = []; initial['projects'] = []; initial['habits'] = []
                        if name == 'template-context':
                            initial['templates'] = [{'id': 'gt', 'type': 'goal', 'name': 'Goal recipe', 'data': {'title': 'Recipe goal', 'progressMode': 'manual', 'progressType': 'numeric', 'targetValue': 2.5, 'unit': 'L', 'targetOffsetDays': 3, 'milestones': [{'title': 'Recipe child', 'dateOffsetDays': 1}], 'reminders': {'sevenDaysBefore': False, 'threeDaysBefore': True, 'oneDayBefore': False, 'onTargetDate': False, 'time': '11:30'}}}]
                        if name == 'multi-link':
                            initial['goals'].append({'id':'g2','title':'Other goal','progressMode':'manual','projectLinks':[{'projectId':'p1','contributionMode':'allTasks','selectedTaskIds':[]}],'taskIds':['direct'],'habitLinks':[{'habitId':'h1','metric':'streak','target':2.5}]})
                            for entity in [initial['projects'][0], initial['tasks'][2], initial['habits'][0]]: entity['goalIds'] = ['g2']
                        page.evaluate('s => localStorage.setItem("todoAppData", JSON.stringify(s))', initial)
                        page.goto(url + '/index.html#goals', wait_until='domcontentloaded'); ready(page)
                        assert page.evaluate('window.__TODO_TEST_MEMORY_DB__ === undefined')
                        if name == 'links-draft': page.screenshot(path='/private/tmp/task14a-goal-before.png')
                        cases[name](page); count += 1; print('PASS', name, flush=True)
                    finally: context.close()
            finally: browser.close()
    finally: server.shutdown(); server.server_close()
    print(f'Goal UX native: {count}/{len(sys.argv[1:] or cases)} passed')


if __name__ == '__main__': main()
