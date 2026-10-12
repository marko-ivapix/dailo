---
paths:
  - "tests/**"
---
# Tests (tests/)

- Node tests use `node:test` and `node:assert/strict`, in English, with a header comment naming the step and its spec.
- Write the test first and see it fail before the change.
- Only the newest step's release test pins the exact version. When a new step bumps the version, the previous pin becomes "or later" (see the `release-step` skill).
- Read app functions with `functionSource(name)` from `tests/support/source.js`, so moved code stays testable. Stub missing context in the harness.
- Compare objects created in a `vm` context after a JSON round-trip, because a cross-realm `deepEqual` fails.
- Never skip, disable or weaken a test to get green. When an older test has to change, add a comment saying which step changed the rule.
