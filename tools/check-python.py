#!/usr/bin/env python3
"""R48: every Python check of a release in one command (npm run check:python), locally and in CI.

AST parsing of tests/*.py and tools/*.py, the browser-path adapter unittest, the browser-regression registry
contracts and the static browser contracts (--dry-run). Needs no packages and never launches a browser.
"""
import ast
import importlib.util
import inspect
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
failures = []


def check(name, run):
    try:
        detail = run()
        print(f'ok   {name}{f" — {detail}" if detail else ""}')
    except Exception as error:  # noqa: BLE001 — every failure is reported, then the script exits non-zero
        failures.append(name)
        print(f'FAIL {name}: {error}')


def python_ast():
    paths = sorted([*ROOT.glob('tests/*.py'), *ROOT.glob('tools/*.py')])
    for path in paths:
        ast.parse(path.read_text(encoding='utf-8'), str(path))
    return f'{len(paths)} files'


def run_script(*args):
    def run():
        result = subprocess.run([sys.executable, *args], cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError((result.stdout + result.stderr).strip().splitlines()[-1:] or ['exit code ' + str(result.returncode)])
        lines = result.stdout.strip().splitlines()
        return lines[-1] if lines else ''
    return run


def registry():
    spec = importlib.util.spec_from_file_location('registry', ROOT / 'tests' / 'test_browser_regression_registry.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    tests = [function for name, function in inspect.getmembers(module, inspect.isfunction) if name.startswith('test_')]
    for function in tests:
        function()
    return f'{len(tests)}/{len(tests)}'


check('Python AST', python_ast)
check('browser-path adapter', run_script('tests/test_browser_path_adapter.py'))
check('regression registry', registry)
check('static browser contracts', run_script('tests/run-browser-regressions.py', '--dry-run'))
print(f'python checks: {4 - len(failures)}/4 passed')
sys.exit(1 if failures else 0)
