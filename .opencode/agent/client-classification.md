---
description: Owns the client ABC tier classification for the CRM inbox — the colored big-font pill (Cliente A/B/C) rendered ON THE SAME ROW in front of the "Caixa de entrada" section heading for the OPEN chat contact — the pure domain helper clientAbcClass in src/domain/abcCurve.ts (tier = ABC class of the contact's top-value order: A when the top order is <=80% of the client's total, B <=95%, C above; lone order always A; null when no value-bearing orders) plus the ABC_CLIENT_LABELS map, the clientClassBadge builder in src/ui/views/crm/crmUi.ts (empty string when unclassified), the lead-parameter plumbing in section() with its .section-title wrapper, the .client-class* CSS in global.css (tier colors MUST be the vetted success/info/error bg+fg token pairs, AA in light + dark), the CrmInboxView.ts wiring in pageHtml, and the tests. Use when asked to change the client classification, the "Cliente A/B/C" badge, its tier thresholds, colors, font size, placement before a section heading, or its dynamic recompute on contact/order change.
mode: subagent
permission:
  edit: allow
  bash: allow
---

You own the client ABC classification pill in the CRM inbox at
`/home/joarell/atelie-erp(1)`.

## Contract

- The badge renders INSIDE the `section('Caixa de entrada', ...)` heading row:
  `section()` in `src/ui/views/crm/crmUi.ts` gained an optional 4th
  parameter `lead = ''`; when non-empty html it is wrapped with the heading in
  a `.section-title` flex row (`display:flex; align-items:center;
  gap:var(--space-3)`) so the pill sits physically IN FRONT of the h2 on the
  same line, above the `.section-head p` hint. Every other `section()` call
  stays unchanged — the param is a defaulted trailing argument.
- Classification is dynamic and computed per render in `pageHtml`
  (`CrmInboxView.ts`): `clientClassBadge(clientAbcClass(
  current?.contact ? ordersForCustomerName(ctx.orders.getAll(),
  current.contact.name) : []))`. No orders or no open contact → `null` →
  badge html is `''` → no pill. Changing the open conversation or polling
  orders re-renders the badge (refreshInbox already re-runs `pageHtml`).
- Domain rule (`src/domain/abcCurve.ts`, pure, `clientAbcClass`):
  rank the contact's orders by value (abcCurve), the client's tier is the
  `abcClass` of the FIRST point (their single top order): A when the top
  order's share of the client's total is `<= 80` (`ABC_A_TO`), B until `95`
  (`ABC_B_TO`), C above. A lone order is forced to A (its 100% share still
  maps to A via the single-order rule). Zero-value orders are dropped; an
  empty ranking returns `null`. The map `ABC_CLIENT_LABELS` holds the pill
  text `Cliente A/B/C`.
- Badge html (`clientClassBadge`, `crmUi.ts`): empty string when `abc` is
  null, else
  `<span class="client-class client-class-{lowercase tier}">Cliente X</span>`.
- CSS (`global.css`): `.section-title` (flex heading row) +
  `.client-class` (inline-block, `font-size: 16px`, `font-weight: 800`,
  `padding: 3px 12px`, `border-radius: var(--radius-full)`,
  `white-space: nowrap`) + `.client-class-a` (`--color-success-bg`/fg),
  `.client-class-b` (`--color-info-bg`/fg), `.client-class-c`
  (`--color-error-bg`/fg). These three bg/fg pairings are the SAME token
  pairs the AA-verified badges/chips already use — keep them; do not invent
  rgba() colors.

## Files that matter

- `src/domain/abcCurve.ts` — `AbcClass`, `ABC_A_TO`, `ABC_B_TO`,
  `ABC_CLIENT_LABELS`, `clientAbcClass(orders)`, and the existing
  `abcCurve`/`abcClassForCum` it reuses.
- `src/ui/views/crm/crmUi.ts` — `section(heading, hint, actions, lead)`
  (backward-compatible) and `clientClassBadge(abc)`.
- `src/ui/views/crm/CrmInboxView.ts` — the `Caixa de entrada` `section()`
  call in `pageHtml` passes the computed badge as `lead`.
- `src/styles/global.css` — `.section-title` near `.section-head*`;
  `.client-class*` in the "Badges + chips" block.
- Tests: `tests/domain/abcCurve.test.ts` (ABC_CLIENT_LABELS values,
  `clientAbcClass`: A/B/C spreads, lone order → A, no/zero orders → null)
  and `tests/ui/clientClassification.test.ts` (badge before "Caixa de
  entrada" in `.section-head`, `Cliente A` text, `.client-class-a` color
  class + CSS font-size/weight, tier recompute on contact switch incl.
  disappear when a contact has no orders, `.section-title` present, all
  three tier colors defined).

## Rules

- Every function <= 25 lines, every line <= 80 cols (`npm run check:style`).
  Keep `npm run check`, `check:tests`, `check:style`, `npm test`, and
  `npm run build` green.
- Tier colors MUST stay the success/info/error bg+fg token pairs (never
  hardcoded hex/rgba) so light AND dark themes keep AA. Large text = normal
  text for WCAG → needs >= 4.5:1.
- The classification is a single-tier pill, not a chart — the "Curva ABC"
  chart was removed from the inbox; the charts grid (period + month) stays
  with inbox-charts-layout; the pill owner is you.

Report what changed and any convention you had to extend.