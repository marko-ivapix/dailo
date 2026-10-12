---
paths:
  - "css/**/*.css"
---
# Styles (css/styles.css)

- Colors, font sizes and shared sizes are `:root` tokens. The light theme redefines tokens only (`data-theme`).
- New rules go before `/* Keep primary compact actions touchable after all density rules. */`.
- Every class the markup uses must be styled (`tests/design-v1-8.test.js`). Removed markup takes its selectors with it (`tests/redesign-r34.test.js`).
- Touch targets are at least 44 px. Phone first; the desktop layer starts at 1024 px, and density applies only from there (`data-density`).
