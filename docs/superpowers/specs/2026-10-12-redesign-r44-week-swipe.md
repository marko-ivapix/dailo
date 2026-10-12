# Redesign R44 — swiping weeks on Navike

**Date:** 2026-10-12 · **Status:** point 3 of the next-steps list ("moze 1 i 3"). · **Release:** `2.0.0-alpha.70`.

## The change

- **The gesture:** on Navike a horizontal swipe over the week bar or the rings pages the week like the arrows of R41. To the left is the next week, to the right the previous one.
- **How it decides:**
  - **What counts:** a touch or pen swipe of at least 48 px that is clearly more horizontal than vertical (1.5:1). A mouse drag does not count.
  - **What it does:** it presses the matching arrow, so the R41 limits apply: a disabled arrow (the first habit's week, next week) stays.
- **The click after a swipe:** the browser sends a click when the finger lifts. It is swallowed once, so the ring under the finger does not open its day.
  - **The arrow's own click:** the arrow is pressed before that guard is set, so it is not swallowed.
  - **No click:** a swipe that ends without a click clears the guard after 400 ms.
- **Scrolling:** the bar and the rings have `touch-action: pan-y`, so vertical scrolling stays with the page.
- **The week table:** it keeps its own sideways scroll on narrow phones and is not a swipe area.

## Checks

- **Node:** `tests/redesign-r44.test.js`, written first; it failed 5/5. It covers:
  - both directions;
  - short, vertical, outside and mouse movements;
  - a disabled arrow;
  - the swallowed click;
  - the wiring and `touch-action`.
- **Manual-pending:** the gesture on a phone.
