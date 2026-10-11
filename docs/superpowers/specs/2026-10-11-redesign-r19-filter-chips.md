# Redesign R19 — filter chips as pills (design)

**Date:** 2026-10-11 · **Status:** the user's screenshot of Redovne obaveze ("Sve · Dnevna soba · Kupatilo · Kuhinja · + Grupa"), "ovo treba biti lepse" · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.42`.

## What changes

1. **Where:** the filter chips at the top of three screens:
   - Redovne obaveze (`.cleaning-chips`): Sve, the groups, Iz projekata and "+ Grupa";
   - Završeni zadaci (`.completed-chips`): the project and the period;
   - Beleške and Resursi (`.knowledge-chips`): Omiljeno, Oblast and Oznaka.

   Before this step they were bare text with no border.
2. **The pill:**
   - **Every chip:** a rounded border with a graphite fill and 14 px text. The pill is drawn inside a 44 px touch height, so taps stay as easy as before.
   - **The selected chip:** filled with the accent blue and white text.
   - **"+ Grupa":** a dashed blue border without a fill, so it reads as an action rather than a filter.
   - **Spacing:** the chips wrap onto a second line when they do not fit, with an 8 px gap.
3. **Unchanged:**
   - the actions, the order and the chips' labels;
   - the star on Omiljeno and the arrows on the menu chips.

## Compatibility

- **Data:** unchanged.
- **Behavior:** unchanged. Only CSS changes.

## Tests (written first)

`tests/redesign-r19.test.js`:

- the pill rules for the three chip rows, their selected and hover states, and the dashed "+ Grupa";
- the 44 px touch height;
- the version `2.0.0-alpha.42`.
