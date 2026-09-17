"""Static V1.6 Today focus-strip and compact task-row contract."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def test_today_has_focus_strip_and_filter_controls():
    source = read('js/app.js')
    assert 'data-today-focus-strip' in source
    assert 'data-today-filter' in source
    assert 'data-today-open-count' in source
    assert 'data-today-completed-count' in source
    assert 'data-action="quick-add" data-today="true"' in source


def test_task_rows_expose_compact_affordance_hooks():
    source = read('js/tasks-ui.js')
    styles = read('css/styles.css')
    assert 'data-task-row-compact' in source
    assert 'data-task-compact-actions' in source
    assert '.task-row[data-task-row-compact]' in styles
