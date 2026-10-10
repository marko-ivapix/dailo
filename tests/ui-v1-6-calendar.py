"""Static V1.6 calendar time-block interaction contract.

Redesign R7 (C3, C6): the week cards and the Raspored hour grid replaced the V1.6 week items. Raspored draws the
planned-time blocks through Core.daySchedule; Core.calendarTimeBlocks stays in core for its tests.
"""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def test_calendar_uses_the_planned_time_block_projection():
    source = read('js/calendar-ui.js')
    assert 'const schedule = Core.daySchedule(tasks, date);' in source
    assert 'Core.calendarDayItems(source, date)' in source
    assert 'function calendarTimeBlocks(state, date)' in read('js/core.js')


def test_only_calendar_tasks_are_draggable_and_drag_updates_planned_fields():
    calendar = read('js/calendar-ui.js')
    app = read('js/app.js')
    assert '<button class="calendar-card" type="button" draggable="true" data-calendar-drag="task"' in calendar
    assert '<button class="calendar-card is-deadline" type="button" data-route=' in calendar
    assert "['calendar-task'].includes(dragState.type)" in app
    assert "updateTask(dragState.id, { plannedDate: date, ...(time ? { plannedTime: time } : {}) })" in app
    assert "calendar-goal" not in app[app.index('function handleDragStart'):app.index('function cleanupDrag')]


if __name__ == '__main__':
    test_calendar_uses_the_planned_time_block_projection()
    test_only_calendar_tasks_are_draggable_and_drag_updates_planned_fields()
    print('PASS: V1.6 calendar static scenarios 2/2')
