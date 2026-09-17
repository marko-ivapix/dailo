"""Static V1.6 calendar time-block interaction contract."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def test_calendar_uses_the_planned_time_block_projection():
    source = read('js/calendar-ui.js')
    assert 'ctx.Core.calendarTimeBlocks(ctx.state, day.date)' in source
    assert 'Core.calendarTimeBlocks(state, date)' in source


def test_only_calendar_tasks_are_draggable_and_drag_updates_planned_fields():
    calendar = read('js/calendar-ui.js')
    app = read('js/app.js')
    assert "!detail && task ? 'draggable=\"true\" data-calendar-drag=\"task\"' : ''" in calendar
    assert "['calendar-task'].includes(dragState.type)" in app
    assert "updateTask(dragState.id, { plannedDate: date, ...(time ? { plannedTime: time } : {}) })" in app
    assert "calendar-goal" not in app[app.index('function handleDragStart'):app.index('function cleanupDrag')]
