"""Run maintained browser regressions and deterministic static contracts.

``--list`` and ``--dry-run`` never launch a browser. Native browser acceptance
is a separate user-owned check; static contracts are the only checks run by
V1.6 entries in the default registry.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SUPPORT = ROOT / 'tests' / 'browser_test_support'
STATIC_RUNNER = ROOT / 'tests' / 'run-static-scenarios.py'
SCENARIO_GROUPS = (
    {'name': 'V1.1', 'scripts': ({'path': 'ui-v1-1-smoke.py', 'mode': 'manual', 'scenarios': ('smoke',)},)},
    {'name': 'V1.2', 'scripts': (
        {'path': 'ui-v1-2-smoke.py', 'mode': 'manual', 'scenarios': ('smoke',)},
        {'path': 'ui-v1-2-lifecycle.py', 'mode': 'manual', 'scenarios': ('lifecycle',)},
    )},
    {'name': 'V1.3', 'scripts': tuple(
        {'path': path, 'mode': 'manual', 'scenarios': scenarios} for path, scenarios in (
            ('ui-v1-3-areas-goals.py', ('areas/goals',)),
            ('ui-v1-3-goal-ux.py', ('goal UX',)),
            ('ui-v1-3-habits-calendar.py', ('habits/calendar',)),
            ('ui-v1-3-migration.py', ('migration',)),
            ('ui-v1-3-safety.py', ('delete -> undo', 'reset/restore')),
            ('ui-v1-3-storage-migration.py', ('reload persistence',)),
            ('ui-v1-3-tools.py', ('attachments', 'modal focus/escape', 'drag-and-drop')),
        )
    )},
    {'name': 'V1.5', 'scripts': (
        {'path': 'ui-v1-5.py', 'mode': 'manual', 'scenarios': ('reload persistence', 'attachments', 'delete -> undo')},
        {'path': 'ui-v1-5-insights.py', 'mode': 'manual', 'scenarios': ('goal/habit insights',)},
    )},
    {'name': 'V1.6', 'scripts': (
        {'path': 'ui-v1-6-calendar.py', 'mode': 'static', 'scenarios': ('calendar drag-and-drop',)},
        {'path': 'ui-v1-6-knowledge.py', 'mode': 'static', 'scenarios': ('knowledge editor',)},
        {'path': 'ui-v1-6-today.py', 'mode': 'static', 'scenarios': ('mobile navigation', 'compact touch layout', 'today focus')},
    )},
)


def _print_registry(dry_run=False):
    if dry_run:
        print('DRY RUN (browser launch skipped)')
    for group in SCENARIO_GROUPS:
        print(f"[{group['name']}]")
        for entry in group['scripts']:
            print(f"  mode: {entry['mode']} | scenarios: {', '.join(entry['scenarios'])}")
            print(f"  script: {entry['path']}")


def _run_entry(group, entry, environment):
    script = ROOT / 'tests' / entry['path']
    command = [sys.executable, str(STATIC_RUNNER), str(script)] if entry['mode'] == 'static' else [sys.executable, str(script)]
    try:
        subprocess.run(command, cwd=ROOT, env=environment, check=True)
    except subprocess.CalledProcessError as error:
        scenario = ', '.join(entry['scenarios'])
        print(_failure_message(group, entry, error.returncode), file=sys.stderr)
        raise


def _failure_message(group, entry, returncode):
    scenario = ', '.join(entry['scenarios'])
    return "[{}] {}: {} failed (exit code {})".format(group['name'], scenario, entry['path'], returncode)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--list', action='store_true', help='list groups and scenarios')
    parser.add_argument('--dry-run', action='store_true', help='show scripts without launching a browser')
    args = parser.parse_args(argv)
    if args.list or args.dry_run:
        _print_registry(dry_run=args.dry_run)
        return 0
    environment = os.environ.copy()
    existing_path = environment.get('PYTHONPATH')
    environment['PYTHONPATH'] = str(SUPPORT) if not existing_path else f'{SUPPORT}{os.pathsep}{existing_path}'
    for group in SCENARIO_GROUPS:
        for entry in group['scripts']:
            _run_entry(group, entry, environment)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
