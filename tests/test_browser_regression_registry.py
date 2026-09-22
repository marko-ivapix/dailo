"""Deterministic checks for the maintained browser-regression registry."""

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "tests" / "run-browser-regressions.py"


def test_registry_covers_all_maintained_release_groups_and_named_scenarios():
    result = subprocess.run(
        [sys.executable, str(RUNNER), "--list"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    output = result.stdout
    for group in ("V1.1", "V1.2", "V1.3", "V1.5", "V1.6"):
        assert f"[{group}]" in output
    for scenario in (
        "reload persistence",
        "attachments",
        "delete -> undo",
        "reset/restore",
        "drag-and-drop",
        "modal focus/escape",
        "mobile navigation",
        "compact touch layout",
    ):
        assert scenario in output


def test_dry_run_reports_script_context_without_launching_browser():
    result = subprocess.run(
        [sys.executable, str(RUNNER), "--dry-run"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    assert "DRY RUN" in result.stdout
    assert "ui-v1-3" in result.stdout
    assert "ui-v1-5" in result.stdout
    assert "ui-v1-6" in result.stdout
    assert "browser launch skipped" in result.stdout.lower()


def test_failure_context_names_group_and_scenario():
    runner = RUNNER.read_text()
    assert "scenario" in runner
    assert "group" in runner
    assert "print(f\"[{group['name']}] {scenario}: {script} failed" in runner
