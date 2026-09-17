"""Focused V1.5 Tasks/Today browser acceptance on disposable in-memory storage."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
MODULES = ('domain-modules.js', 'knowledge.js', 'goals-ui.js', 'habits-ui.js', 'saved-views-ui.js', 'projects-ui.js', 'areas-ui.js', 'settings-ui.js', 'templates-ui.js', 'calendar-ui.js', 'tasks-ui.js', 'cleaning-ui.js')
SHELL = '<div id="app"><aside id="sidebar"></aside><main id="main"></main></div><div id="modal-root"></div><div id="toast-root"></div>'


def boot(page):
    page.set_content(SHELL)
    page.evaluate("location.hash = '#today'")
    page.evaluate('''() => {
      window.__TODO_TEST_MEMORY_DB__ = true;
      const values = new Map();
      Object.defineProperty(window, 'localStorage', {configurable: true, value: {
        getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key), clear: () => values.clear()
      }});
    }''')
    for filename in ('vendor/jszip.min.js', 'js/core.js', 'js/storage.js', 'js/attachments.js', 'js/backup.js'):
        page.add_script_tag(content=(ROOT / filename).read_text())
    for filename in MODULES:
        page.add_script_tag(content=(ROOT / 'js' / filename).read_text())
    page.add_script_tag(content=(ROOT / 'js' / 'app.js').read_text())
    page.wait_for_selector('.page-title')


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        boot(page)
        task_id = page.evaluate("TodoApp.state.tasks.find(t => t.title === 'Finish homepage').id")
        completed_before = page.evaluate("TodoApp.state.tasks.filter(t => t.isCompleted && String(t.completedAt || '').slice(0, 10) === TodoCore.dateOnly()).length")

        page.click(f'[data-action="open-task"][data-task-id="{task_id}"]')
        expect(page.locator('#detail-duration-minutes')).to_be_visible()
        page.fill('#detail-duration-minutes', '45')
        page.locator('#detail-duration-minutes').press('Enter')
        assert page.evaluate('(id) => TodoApp.state.tasks.find(t => t.id === id).durationMinutes', task_id) == 45
        page.locator('#modal-root [data-action="toggle-focus-task"]').click()
        assert page.evaluate('(id) => TodoApp.state.settings.focusTaskIds.includes(id)', task_id)
        page.click('[data-action="close-modal"]')

        # Focus is capped at three and Today completes a task without opening its detail.
        page.evaluate('''() => {
          const candidates = TodoApp.state.tasks.filter(t => !t.isCompleted).slice(0, 4);
          TodoApp.state.settings.focusTaskIds = candidates.map(t => t.id);
          TodoApp.render();
        }''')
        assert page.locator('[data-today-focus] .task-row').count() == 3
        focus_task_id = page.locator('[data-today-focus] .task-row').first.get_attribute('data-task-id')
        page.locator(f'[data-today-focus] [data-inline-today-complete][data-task-id="{focus_task_id}"]').click()
        assert page.evaluate('(id) => TodoApp.state.tasks.find(t => t.id === id).isCompleted', focus_task_id)

        # Review summarizes today's open/completed Focus work from the same task records.
        expect(page.locator('[data-daily-review]')).to_contain_text('Daily review')
        assert page.locator('[data-daily-review-completed]').inner_text().startswith(str(completed_before + 1))

        # Trailing phrases retain title-first Quick Add; explicit form values override parsed dates.
        page.evaluate('TodoApp.openQuickAdd({today: true})')
        page.fill('#quick-title', 'Plan sprint tomorrow 09:30')
        page.click('[data-action="create-task"]')
        created = page.evaluate("TodoApp.state.tasks.find(t => t.title === 'Plan sprint')")
        assert created and created['plannedTime'] == '09:30'
        assert created['plannedDate'] == page.evaluate('TodoCore.addDays(TodoCore.dateOnly(), 1)')
        page.evaluate('TodoApp.openQuickAdd({today: true})')
        page.fill('#quick-title', 'Explicit date tomorrow 09:30')
        page.click('[data-action="quick-plan-picker"]')
        page.click('[data-pop-action="set-plan"][data-date]')
        page.click('[data-action="create-task"]')
        explicit = page.evaluate("TodoApp.state.tasks.find(t => t.title === 'Explicit date tomorrow')")
        assert explicit and explicit['plannedDate'] == page.evaluate('TodoCore.dateOnly()') and explicit['plannedTime'] == '09:30'
        page.evaluate('TodoApp.openQuickAdd()')
        page.fill('#quick-title', 'Explicit time tomorrow 09:30')
        page.click('[data-action="toggle-quick-more"]')
        page.fill('#quick-planned-time', '14:00')
        page.locator('#quick-planned-time').press('Tab')
        page.click('[data-action="create-task"]')
        assert page.evaluate("TodoApp.state.tasks.find(t => t.title === 'Explicit time').plannedTime") == '14:00'

        # Calendar derives timed blocks from Tasks. It does not turn an all-day
        # task into a timed event or make Habits draggable.
        today = page.evaluate('TodoCore.dateOnly()')
        page.evaluate('''date => {
          const first = TodoApp.state.tasks.find(t => t.title === 'Finish homepage');
          const second = TodoApp.state.tasks.find(t => t.title === 'Buy groceries');
          // The earlier Focus flow may have completed either shared fixture.
          // Calendar's timed-plan assertions require independent open Tasks.
          for (const task of [first, second]) { task.isCompleted = false; task.completedAt = null; }
          first.plannedDate = date; first.plannedTime = '09:00'; first.dueDate = date; first.dueTime = '11:00'; first.durationMinutes = 45;
          second.plannedDate = date; second.plannedTime = '09:30'; second.durationMinutes = 30;
          TodoApp.state.tasks.push({id:'all_day_v15', title:'All day preserved', plannedDate:date, plannedTime:null, dueDate:null, durationMinutes:null, isInbox:false, isCompleted:false, subtasks:[], tagIds:[], goalIds:[], attachmentIds:[]});
          location.hash = '#calendar'; TodoApp.render();
        }''', today)
        assert page.evaluate("TodoApp.state.tasks.filter(t => ['task_homepage', 'task_groceries'].includes(t.id)).every(t => !t.isCompleted && t.completedAt === null)")
        assert page.locator('.calendar-timed-block').count() >= 2
        expect(page.locator('.calendar-timed-block', has_text='Finish homepage')).to_contain_text('09:00–09:45')
        timed_homepage = page.locator('.calendar-timed-block[data-calendar-item-id="task_homepage"]')
        assert timed_homepage.count() == 1
        expect(timed_homepage).to_contain_text('Due · 11:00')
        assert page.locator('.calendar-timed-block.has-conflict').count() >= 2
        assert page.locator('.calendar-all-day', has_text='All day preserved').count() == 1
        assert page.locator('[data-calendar-type="habit"][draggable="true"]').count() == 0

        # Dropping a Task onto a timed block edits only its plan moment, not duration.
        page.evaluate('''() => {
          const source = document.querySelector('.calendar-timed-block[data-calendar-item-id="task_homepage"]');
          const target = document.querySelector('.calendar-timed-block[data-calendar-item-id="task_groceries"]');
          const transfer = new DataTransfer();
          source.dispatchEvent(new DragEvent('dragstart', {bubbles:true, dataTransfer:transfer}));
          target.dispatchEvent(new DragEvent('drop', {bubbles:true, dataTransfer:transfer}));
        }''')
        moved = page.evaluate("TodoApp.state.tasks.find(t => t.id === 'task_homepage')")
        assert moved['plannedDate'] == today and moved['plannedTime'] == '09:30' and moved['durationMinutes'] == 45

        page.click(f'[data-calendar-date="{today}"] .calendar-day-heading')
        expect(page.locator('.calendar-conflict-note')).to_be_visible()
        page.keyboard.press('Escape')
        page.click('[data-action="calendar-view"][data-view="month"]')
        assert page.locator('.calendar-timed-block').count() == 0
        browser.close()


if __name__ == '__main__':
    main()
