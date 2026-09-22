"""Run the maintained browser regression scenarios.

``--list`` and ``--dry-run`` are registry-only operations and never launch a
browser. Native browser acceptance remains a separate user-owned check.
"""

import argparse

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SUPPORT = ROOT / "tests" / "browser_test_support"
SCENARIO_GROUPS = (
    {"name": "V1.1", "scripts": ("ui-v1-1-smoke.py",), "scenarios": ("smoke",)},
    {"name": "V1.2", "scripts": ("ui-v1-2-smoke.py", "ui-v1-2-lifecycle.py"), "scenarios": ("smoke", "lifecycle")},
    {
        "name": "V1.3",
        "scripts": (
            "ui-v1-3-areas-goals.py", "ui-v1-3-goal-ux.py", "ui-v1-3-habits-calendar.py",
            "ui-v1-3-migration.py", "ui-v1-3-safety.py", "ui-v1-3-storage-migration.py", "ui-v1-3-tools.py",
        ),
        "scenarios": ("reload persistence", "attachments", "delete -> undo", "reset/restore", "drag-and-drop", "modal focus/escape"),
    },
    {"name": "V1.5", "scripts": ("ui-v1-5.py", "ui-v1-5-insights.py"), "scenarios": ("reload persistence", "attachments", "delete -> undo")},
    {"name": "V1.6", "scripts": ("ui-v1-6-calendar.py", "ui-v1-6-knowledge.py", "ui-v1-6-today.py"), "scenarios": ("mobile navigation", "compact touch layout", "drag-and-drop")},
)
SCRIPTS = tuple(script for group in SCENARIO_GROUPS for script in group["scripts"])


def _print_registry(dry_run=False):
    if dry_run:
        print("DRY RUN (browser launch skipped)")
    for group in SCENARIO_GROUPS:
        print(f"[{group['name']}]\n  scenarios: {', '.join(group['scenarios'])}")
        for script in group["scripts"]:
            print(f"  script: {script}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", help="list groups and scenarios")
    parser.add_argument("--dry-run", action="store_true", help="show scripts without launching a browser")
    args = parser.parse_args(argv)
    if args.list or args.dry_run:
        _print_registry(dry_run=args.dry_run)
        return 0
    environment = os.environ.copy()
    existing_path = environment.get("PYTHONPATH")
    environment["PYTHONPATH"] = str(SUPPORT) if not existing_path else f"{SUPPORT}{os.pathsep}{existing_path}"
    for group in SCENARIO_GROUPS:
        for script in group["scripts"]:
            try:
                subprocess.run([sys.executable, str(ROOT / "tests" / script)], cwd=ROOT, env=environment, check=True)
            except subprocess.CalledProcessError as error:
                scenario = group["scenarios"][0]
                print(f"[{group['name']}] {scenario}: {script} failed (exit code {error.returncode})", file=sys.stderr)
                raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
