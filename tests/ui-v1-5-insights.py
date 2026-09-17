"""V1.5 Goal/Habit detail persistence in a disposable browser profile."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


def ready(page):
    page.wait_for_function('window.TodoApp && TodoApp.ready')
    page.evaluate('() => TodoApp.ready')
    expect(page.locator('.page-title')).to_be_visible()


def edit_property(page, domain, field, value):
    page.click(f'[data-{domain}-property="{field}"]')
    page.fill(f'#{domain}-detail-{field}', value)
    page.click(f'[data-action="save-{domain}-property"]')


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.goto(f'http://127.0.0.1:{server.server_port}/')
            ready(page)
            today = date.today().isoformat()
            tomorrow = (date.today() + timedelta(days=1)).isoformat()
            page.evaluate('''({today, tomorrow}) => {
              const state = TodoApp.state;
              state.goals.push({id: 'insight-goal', title: 'Reading goal', status: 'active', progressMode: 'manual', progressType: 'numeric', currentValue: 0, targetValue: 10, unit: 'books', targetDate: tomorrow, taskIds: [], projectLinks: [], habitLinks: [], milestones: [], reminders: {}});
              state.habits.push({id: 'insight-habit', name: 'Read daily', status: 'active', trackingType: 'numeric', targetValue: 4, startDate: today, frequencyType: 'daily', quickValues: [], goalIds: [], reminders: []});
              localStorage.setItem('todoAppData', JSON.stringify(state));
            }''', {'today': today, 'tomorrow': tomorrow})
            page.goto(f'http://127.0.0.1:{server.server_port}/#goal/insight-goal')
            page.reload()
            ready(page)
            expect(page.locator('[data-goal-health]')).to_have_attribute('data-goal-health', 'at-risk')
            edit_property(page, 'goal', 'targetValue', '12.5')
            edit_property(page, 'goal', 'unit', 'chapters')
            page.fill('#goal-current-value', '3.5')
            page.click('[data-action="save-goal-progress"]')
            page.reload()
            ready(page)
            goal = page.evaluate("TodoApp.state.goals.find(g => g.id === 'insight-goal')")
            assert (goal['currentValue'], goal['targetValue'], goal['unit'], goal['status']) == (3.5, 12.5, 'chapters', 'active')
            page.evaluate("location.hash = '#habit/insight-habit'")
            expect(page.locator('.page-title')).to_have_text('Read daily')
            for field, value in [('minimumTarget', '2'), ('idealTarget', '4'), ('graceDays', '1')]:
                edit_property(page, 'habit', field, value)
            page.fill('#habit-direct-total', '2')
            page.click('[data-action="save-habit-total"]')
            expect(page.locator('[data-habit-target-status]')).to_have_attribute('data-habit-target-status', 'minimum')
            page.reload()
            ready(page)
            habit = page.evaluate("TodoApp.state.habits.find(h => h.id === 'insight-habit')")
            assert (habit['minimumTarget'], habit['idealTarget'], habit['graceDays']) == (2, 4, 1)
            expect(page.locator('[data-habit-target-status]')).to_have_attribute('data-habit-target-status', 'minimum')
            expect(page.locator('[data-habit-insight="week"]')).to_contain_text('1 minimum')
            expect(page.locator('#habit-history-date')).to_have_attribute('max', today)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
