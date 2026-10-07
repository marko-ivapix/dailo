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


def test_mobile_navigation_and_touch_targets_are_wired():
    html = read('index.html')
    app = read('js/app.js')
    styles = read('css/styles.css')
    assert 'id="mobile-more-trigger"' in html
    assert 'data-action="open-mobile-more"' in html
    assert 'data-mobile-more-route' in app
    assert 'aria-modal="true"' in app
    assert 'min-height: 44px' in styles


def test_mobile_navigation_exposes_all_secondary_routes():
    html = read('index.html')
    app = read('js/app.js')
    assert 'id="mobile-more-trigger"' in html
    for route in ('upcoming', 'projects', 'areas', 'notes', 'resources', 'templates', 'saved-views', 'settings'):
        assert f"['{route}'" in app or f'"{route}"' in app


def test_compact_touch_layout_keeps_primary_actions_at_44px():
    styles = read('css/styles.css')
    assert 'Keep primary compact actions touchable after all density rules' in styles
    assert '.task-actions .btn-icon' in styles
    assert 'min-height: 44px' in styles[styles.rfind('Keep primary compact actions touchable'):]


if __name__ == '__main__':
    test_today_has_focus_strip_and_filter_controls()
    test_task_rows_expose_compact_affordance_hooks()
    test_mobile_navigation_and_touch_targets_are_wired()
    print('PASS: V1.6 Today mobile/compact static scenarios 3/3')
