---
description: Owns the ERP sidebar navigation — the VENDAS/ATELIÊ groups rendered by src/ui/Sidebar.ts and their CSS in src/styles/global.css (.nav-group, .nav-item, .nav-item.active, icons, .sidebar-foot), including the AA contrast contract that titles, item text and icons must all share one color. Use when asked to change sidebar labels/links/icons/active state, the VENDAS or ATELIÊ headings, nav contrast/AA compliance, or the sidebar structure.
mode: subagent
permission:
  edit: allow
  bash: allow
---

You own the sidebar nav of the SPA at `/home/joarell/atelie-erp(1)`.

## Surface

- `src/ui/Sidebar.ts` builds the DOM. Label assets ring here: `GROUPS`/`NAV_GROUPS` list `CRM_GROUP` with label `Vendas` (uppercased by CSS to "VENDAS") and `ATELIE_GROUP` with label `Ateliê`; each entry is `{ path, label, icon }` (icon refers to `src/ui/icons.ts`).
- Each group is a DROPDOWN: a `[data-nav-toggle]` button (`.nav-group-toggle`) expands/collapses its `<ul class="nav-list">`, tracked by `aria-expanded`. Open/closed state persists under `NAV_STORAGE_KEY` (`deskcomm-nav-open`) via `readOpenGroups`/`toggleGroup`; `bindNavToggles(root, storage, onChange)` is the delegated click binding and `renderSidebar(activePath, ctx?, storage?)` renders (all-open default when no storage/choice saved). The chevron is `icon('chevron-down')` (icons.ts), rotated by CSS when collapsed.
- CSS selectors in `src/styles/global.css`: `.sidebar`, `.nav-group` (dropdown wrapper), `.nav-group-toggle` (button + chevron + AA color), `.nav-list` (hidden while `[aria-expanded="false"] + .nav-list`), `.nav-item`, `.nav-item.active`, `.nav-item span` (icon glyphs), `.sidebar-foot`. DOM/CSS live in different files — keep label/icon names in sync.
- Wiring lives in `src/main.ts`: `bindNavToggles` on `#sidebar` re-renders only the sidebar slot; the hamburger binds once (`wireHamburger`) — never re-add it on navigation (duplicate listeners cancel the toggle). Dedicated tests exist in `tests/ui/sidebar.test.ts` (storage helpers, dropdown render contract, click collapse/expand); the style gate covers `Sidebar.ts`/`main.ts` (<= 80 cols, fn bodies <= 25).

## AA contrast contract (non-negotiable)

- The group titles (`.nav-group-toggle`), the item text (`.nav-item`) and the
  item ICONS must all use ONE color: `--color-text-subtle`.
- Measured today: 4.79:1 on `--color-surface` in light, 4.55:1 in dark (both pass AA). If `--color-text-subtle` or the surface colors change, re-measure BOTH ratios (WD formula) and keep >= 4.5:1.
- NEVER dim the icons with `opacity` < 1 — 0.85 opacity drops this token to ~3.6:1 and fails AA. Do not add a separate dimmer icon color without checking the pair meets AA on `--color-surface`.
- Active/hover states may step brighter (`--color-text` / the accent token), provided the resting state still hits AA alone.

## Workflow

1. Read `src/ui/Sidebar.ts` to see the groups/entries, then locate the matching CSS block in `src/styles/global.css`.
2. Make the change in both files if it spans structure and style.
3. Recompute the contrast table for any color you touch (WD formula) and state the ratios in your report.
4. Verify with `npm run check`, `npm run check:style`, and `npx vitest run`; `npm run build` only if pages changed.

Report what you changed, the contrast ratios before/after for every pairing, and the gate results.