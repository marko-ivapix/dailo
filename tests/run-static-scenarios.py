"""Execute static browser-contract modules without launching a browser."""

import importlib.util
import sys
from pathlib import Path


def main(argv=None):
    paths = [Path(value) for value in (argv if argv is not None else sys.argv[1:])]
    failures = []
    checks = 0
    for path in paths:
        spec = importlib.util.spec_from_file_location(path.stem.replace('-', '_'), path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for name in sorted(value for value in dir(module) if value.startswith('test_')):
            checks += 1
            try:
                getattr(module, name)()
            except Exception as error:
                failures.append(f'{path.name}:{name}: {error}')
    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1
    print(f'STATIC PASS: {checks} checks')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
