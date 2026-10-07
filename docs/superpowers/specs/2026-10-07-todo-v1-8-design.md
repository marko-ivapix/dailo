# Dailo V1.8 Design Specification — Quiet Graphite / Swiss Compact

**Date:** 2026-10-07
**Status:** Approved for implementation by the V1.8 continuation brief (direction defaulted, see below)
**Baseline:** V1.7 stabilization, commit `5b1b8f6` plus the uncommitted 2026-10-07 documentation sync
**Plan:** `docs/superpowers/plans/2026-10-07-todo-v1-8.md`
**Ledger:** `docs/superpowers/progress-v1-8.md`

## Goal

V1.8 redesigns the visual interface of every major surface while preserving all existing functionality, data behavior and interaction semantics. It is a presentation release: no persisted schema change, no Search change, no new runtime dependency and no new product behavior.

## Direction decision

Three visual directions were prepared in an earlier design exploration. Those boards are **not present in this repository or the surrounding workspace**; they were chat-only proposals. No direction was explicitly selected, so the continuation brief's default applies: **Quiet Graphite / Swiss Compact**, because it best preserves the existing dark, compact technical system. This document is therefore the source of truth for V1.8 visuals; the boards are inspiration only.

Quiet Graphite / Swiss Compact means:

- **Graphite, not navy.** Neutrals move from the V1.7 blue-tinted navy (`#141821`) to a near-neutral graphite with a faint cool cast. Neutrals dominate; color is reserved for action and state.
- **Hairlines over fills.** Structure comes from 1px lines and a strict spacing rhythm, not from stacked filled cards, glow or blur.
- **Smaller radii.** Controls 6px, cards 8px, overlays 12px. No oversized rounded cards.
- **Typographic hierarchy.** Space Grotesk for page titles, card headings and display numerals; Geist for everything operational. Quiet uppercase micro-labels for sections; tabular numerals for counts.
- **One accent rule.** Electric blue fills primary actions; a lighter on-dark blue carries focus, active navigation and links. Mint means completion, yellow warning, red danger/overdue.
- **Compact by default.** The existing compact density contract (`--control-height: 32px`, `--task-min-height: 44px`, `--content-gutter: 20px`) is retained; 44px touch targets on phones are retained.

## Non-negotiable constraints (unchanged behavior)

The following must behave exactly as in V1.7. Any V1.8 change that would alter one of these requires a new approved spec.

| Area | Preserved contract |
| --- | --- |
| Architecture | Static HTML/CSS/vanilla JavaScript, classic scripts, `TodoDomainModules` adapter contract, no framework, no build step, no new dependency. |
| Persistence | `localStorage.todoAppData` V3 metadata schema; IndexedDB `todoAppDB` v1 stores; ZIP `backupVersion: 2`; no persisted key or ID renamed. |
| Entities | Tasks, Projects, Areas, Goals, Habits, Notes, Resources, Templates and Saved Views keep their semantics, links and lifecycles. |
| Search | Global Search scope, ranking, result grouping and keyboard behavior are untouched. V1.8 may only restyle the existing Search modal markup through CSS. |
| Bulk actions | No bulk-selection or bulk-action UI, selectors or affordances. |
| Deletion | Confirmation → Delete → Snackbar Undo for every normal entity. |
| Global destructive actions | Typed `RESET`/`RESTORE`, safety ZIP, recovery snapshot, verification and rollback. |
| Navigation | Desktop sidebar meaning and order; hash routes; mobile bottom navigation with Today/Inbox/Calendar/Goals/Habits plus More; More sheet focus trap/Escape/return focus. |
| Capture | Floating Quick Add menu on all viewports with Task/Goal/Habit/Note/Resource/Project; Quick Add never hides the bottom navigation. |
| Task Properties | Properties, Schedule and Links & notes disclosures stay collapsed by default; essentials row stays visible. |
| Density | Runtime density tokens set by `renderMain()` (`--content-gutter`, `--control-height`, `--task-min-height`) keep their names and compact/comfortable values. |
| Accessibility | Named dialogs, focus return, semantic Area tabs, scoped live regions, shortcut suppression while typing, 44px phone touch targets. |

## Design tokens

Tokens live in the top `:root` block of `css/styles.css`. V1.8 introduces primitives and semantic roles, and keeps every V1.7 token name as an alias so adapter inline styles (`var(--danger)`, `var(--text-muted)`, `var(--info)`, `var(--success)`) and older rules keep working.

### Color primitives

| Token | Value | Use |
| --- | --- | --- |
| `--graphite-950` | `#0B0D10` | Sidebar, bottom navigation |
| `--graphite-900` | `#0F1114` | Canvas |
| `--graphite-850` | `#14171B` | Panels, cards, modals |
| `--graphite-800` | `#1A1D22` | Inputs, interactive fills |
| `--graphite-750` | `#21252B` | Hover |
| `--graphite-700` | `#292E35` | Selected/pressed |
| `--line-1` / `--line-2` / `--line-3` | `#22262C` / `#2D3239` / `#3C434D` | Subtle / default / strong hairlines |
| `--ink-1` | `#F3F4F6` | Titles, values |
| `--ink-2` | `#D5D9DF` | Body copy |
| `--ink-3` | `#9199A4` | Metadata, labels, placeholders |
| `--ink-4` | `#6B727D` | Disabled and decorative only |
| `--blue-600` / `--blue-500` / `--blue-700` | `#0619FE` / `#2236FF` / `#0013D6` | Primary fill / hover / active |
| `--blue-300` | `#8590FF` | On-dark accent: focus ring, active nav, links, task type |
| `--mint-400` | `#30CBAD` | Completion, success, habits |
| `--yellow-400` | `#F5B942` | Warning, due today, milestones |
| `--red-400` / `--red-600` | `#FF6464` / `#D93A3F` | Danger text/icons / danger fill |

### Verified contrast (WCAG 2.x relative luminance)

| Pair | Ratio |
| --- | ---: |
| `--ink-3` on canvas / panel / input / hover / selected | 6.57 / 6.25 / 5.87 / 5.35 / 4.75 |
| `--blue-300` on canvas / panel / selected | 6.69 / 6.36 / 4.84 |
| `--red-400` on canvas / panel | 6.54 / 6.21 |
| `--mint-400` on canvas | 9.25 |
| White on `--blue-600` / `--blue-500` | 8.15 / 6.91 |
| White on `--red-600` | 4.54 |
| Dark ink on `--mint-400` (completed check) | 9.52 |

`--ink-4` (3.9:1 on canvas) is not used for informational text. Hairlines are decorative structure; interactive controls are identified by fill, label and border together, and their hover/focus states exceed 3:1.

### Semantic aliases kept from V1.7

`--primary`, `--primary-hover`, `--primary-active`, `--primary-focus` (now the on-dark accent `--blue-300`), `--accent*`, `--bg-primary`, `--surface-nav`, `--surface-card-primary`, `--surface-card-dark`, `--surface-interactive`, `--surface-hover`, `--text-primary`, `--text-secondary`, `--text-muted`, `--text-on-card-muted`, `--border-subtle`, `--border-default`, `--border-strong`, `--success`, `--warning`, `--danger`, `--info`. New: `--danger-fill`, `--accent-tint`, `--danger-tint`, `--warning-tint`, `--success-tint`.

### Typography

| Token | Value | Use |
| --- | --- | --- |
| `--font-display` | Space Grotesk | Page titles, card/dialog headings, display numerals |
| `--font-ui` | Geist | Navigation, body, forms, metadata, controls |
| `--text-2xs` … `--text-2xl` | 10 / 11 / 12 / 13 / 14 / 16 / 20 / 24px | Micro-label → page title |
| `--tracking-label` | `.08em` | Uppercase section labels |
| `--tracking-display` | `-.02em` | Space Grotesk headings |

Body stays 14px (compact). Page title 22px desktop, 20px phone. Counts and dates use `font-variant-numeric: tabular-nums`. No new font weights are loaded.

### Geometry, elevation, motion, focus

- Radius: `--radius-xs 4px`, `--radius-sm 6px`, `--radius-md 8px`, `--radius-lg 12px`, `--radius-xl 16px`, `--radius-pill 999px` (V1.7: 8/12/16/24).
- Spacing: the existing 4px scale (`--space-1` … `--space-24`) is unchanged.
- Elevation: shadows only on overlays (`--shadow-overlay`, `--shadow-popover`, `--shadow-fab`). No glow, no `backdrop-filter`.
- Motion: `--motion-fast 140ms`, `--motion-base 200ms`, `--motion-slow 260ms`; the global `prefers-reduced-motion` rule remains and also stops the loading indicator.
- Focus: `--focus-ring: 0 0 0 2px var(--graphite-900), 0 0 0 4px var(--blue-300)` replaces the V1.7 18%-alpha ring that was nearly invisible on dark surfaces. Focusable elements also receive a transparent outline so a ring appears in Windows forced-colors mode. Elements inside `overflow: hidden` rows use an inset ring.
- Sidebar: `240px` expanded / `72px` collapsed (brand geometry in `AGENTS.md`; V1.5 had tightened it to 220px).

## Responsive rules

| Range | Shell | Navigation | Quick Add | Overlays |
| --- | --- | --- | --- | --- |
| ≥ 1024px | Sidebar 240/72 + content | Sidebar only | Bottom-right, 24px inset | Centered modals |
| 701–1023px | Forced 72px icon rail + content | Rail + 6-item bottom bar | Above bottom bar (`74px` + safe area) | Centered modals |
| ≤ 700px | Content only | 6-item bottom bar + More sheet | Above bottom bar (`70px` + safe area) | Quick Add, Task Properties and small modals become bottom sheets |

- Phones keep 44px minimum touch targets for completion controls, task/subtask actions, modal icon buttons, quick chips and navigation. The V1.6/V1.7 guard (`Keep primary compact actions touchable after all density rules`) remains the **last** rule in the stylesheet so no V1.8 density rule can shrink it.
- Calendar Week keeps the horizontal-scroll presentation with sticky day headings at ≤1023px.
- Runtime density tokens are written inline on `<html>` by `renderMain()`, so they win over media-query `:root` overrides. V1.8 does not rely on media-query token overrides for gutters or control heights; phone-specific sizes use explicit values.

## Surface contracts

1. **Global density and controls.** Buttons 6px radius; primary electric-blue fill; secondary graphite fill with hairline; ghost transparent; danger uses `--danger-fill`. Inputs graphite fill with hairline, accent border on focus. Page header: Space Grotesk title, muted subtitle, hairline rule. Section labels become quiet uppercase micro-labels with tabular counts.
2. **Desktop shell/sidebar.** Darkest graphite rail with right hairline. Navigation items 32px; active item has a graphite fill, ink-1 label, accent icon and a 2px accent rail. Group titles are quiet micro-labels. Badges tabular; active badge uses the primary fill.
3. **Mobile navigation and Quick Add.** Opaque graphite bottom bar with top hairline (no blur, minimal shadow); active item marked by accent icon plus a 2px top indicator. More sheet gains a decorative grabber and 46px route rows. Quick Add toggle becomes a 44px rounded square (12px radius) with the primary fill; options use graphite label pills and 44px icon tiles.
4. **Today and Inbox.** Focus strip as a single hairline panel with tabular count chips. Dashboard cards share the panel language; pinned cards use a 2px accent rail. Daily actions become compact icon-left tiles in an auto-fit grid (two columns on phones). Overdue headers use a red label and red hairline. Task rows: hairline hover, 18px completion ring that turns mint, quieter metadata. Inbox filters become a segmented control. Milestone check buttons (`.task-check`, `.check-toggle`) receive real button styling.
5. **Task Properties.** 12px-radius panel with hairline header, compact essential chips, disclosure summaries with caret and right-aligned meta, key/value property rows, quieter group labels. Popovers, Search modal, confirmation dialogs and toasts adopt the same overlay language; alert toasts (`role="alert"`) carry a warning rail and icon instead of the success icon color.
6. **Calendar.** Segmented Week/Month control (`.list-tabs`), Space Grotesk period label, hairline week grid, accent today marker, type-colored 2px rails on items (tasks blue, habits mint, goals neutral ink, milestones yellow), tabular month cells and a quieter Day Detail.
7. **Goals and Habits.** Group headers become flat bands with a hairline rule. Goal/Habit rows share the 8px card; progress bars 4px with the accent fill, mint when complete; overdue/done/missed rails 2px. Monthly Habit tracker cells keep their dimensions and colors by state; analysis panels use hairline separators.
8. **Areas, Projects, Notes and Resources.** Area tabs become underline tabs (accent rail on `aria-selected="true"`). Summary tiles use display numerals. List rows share the card language; clips use an accent rule; attachment drop zones use a strong dashed hairline.
9. **Templates, Settings and More.** Template type switch (`.view-tabs`) becomes a segmented control. Settings cards become hairline panels with Space Grotesk headings and divided rows. Snapshot, backup summary and warnings adopt the panel/tint language.
10. **States.** Empty states gain a quiet geometric mark and hairline panel. The data-loading surface gets `role="status"`, `aria-busy` and a CSS ring indicator (static under reduced motion). Error surfaces (storage warning band, validation, invalid inputs, alert toasts, recovery card) use the danger tint and rail. Focus states as above; `prefers-contrast: more` strengthens hairlines and muted ink; forced-colors mode keeps visible focus outlines.

## Implementation approach

- **One stylesheet.** All V1.8 visuals live in `css/styles.css`: the top `:root` block is rewritten as the V1.8 token system (with V1.7 aliases), and a single appended `V1.8 Quiet Graphite` layer is organized by the ten surfaces above. Earlier V1.3–V1.7 layers are not consolidated in V1.8: without a native-browser visual baseline, rewriting tuned responsive rules is the highest regression risk. Consolidation is a follow-up once V1.8 has user-owned-browser acceptance.
- **Markup changes are limited** to presentation hooks and accessibility attributes that do not alter behavior: the loading surface's `role="status"`/`aria-busy`/indicator element, a class replacing one inline style in task-row metadata, and version strings in the document title/brand tooltip. No `data-action`, route, ID, persisted field or event handler changes.
- **Tests.** `tests/design-v1-8.test.js` holds static contracts per surface (token presence and aliases, focus visibility, geometry, touch-target guard ordering, no `backdrop-filter`, no bulk hooks, all emitted classes styled or explicitly hook-only). Existing V1.5–V1.7 static contracts must stay green.

## Acceptance

- Full Node suite, JavaScript syntax, Python AST, browser-path adapter, browser-regression registry, static browser contracts and `git diff --check` pass.
- `js/core.js`, `js/storage.js`, `js/backup.js` and `js/attachments.js` are unchanged; Search code paths in `js/app.js` are unchanged.
- The progress ledger records exact counts and marks native-browser visual, responsive, touch, keyboard, forced-colors and reduced-motion acceptance as **manual-pending** unless a user-owned-browser run is actually performed.

## Out of scope

Light theme, layout restructuring, CSS consolidation of earlier layers, new features or settings, icon-library or font changes, new font weights, schema/Search/recovery changes, bulk actions, and any backend/account/sync work.
