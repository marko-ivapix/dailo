"""Run the unchanged V1.2 browser regressions with the test-only path adapter."""

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SUPPORT = ROOT / "tests" / "browser_test_support"
SCRIPTS = (
    "ui-v1-1-smoke.py",
    "ui-v1-2-smoke.py",
    "ui-v1-2-lifecycle.py",
)


def main():
    environment = os.environ.copy()
    existing_path = environment.get("PYTHONPATH")
    environment["PYTHONPATH"] = str(SUPPORT) if not existing_path else f"{SUPPORT}{os.pathsep}{existing_path}"
    for script in SCRIPTS:
        subprocess.run([sys.executable, str(ROOT / "tests" / script)], cwd=ROOT, env=environment, check=True)


if __name__ == "__main__":
    main()
