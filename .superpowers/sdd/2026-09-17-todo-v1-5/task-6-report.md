# Task 6 report — Templates and personalization

## Delivered

- Task template title and notes support `{{date}}`, `{{today}}`, and `{{tomorrow}}`; substitution happens during snapshot instantiation, so source templates and relative offsets remain unchanged.
- Task templates can opt into one scheduled creation date. On that date the live app creates exactly one Task from the snapshot and records that generation on the template.
- Today has Focus View, move and pin controls for Daily focus, Daily review, and Daily actions. Preferences use the optional normalized `settings.dashboard` object and are reapplied after render.

## TDD and verification

- RED: the added template/dashboard storage test failed because `Plan {{date}}` was not interpolated.
- GREEN: `node --test tests/storage-v1-5.test.js` passed 7/7 after interpolation was implemented.
- Syntax checks for `core.js`, `templates-ui.js`, and `app.js` passed; `git diff --check` passed.

## Browser limitation

The isolated browser runtime remains unavailable under this sandbox, so rendered dashboard controls and scheduled-template UI should be run through `tests/ui-v1-5.py` in a permitted headless runtime before release. No personal Chrome was opened.
