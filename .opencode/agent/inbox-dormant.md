---
description: Owns the Inbox snooze lifecycle — the "Adormecer" (snooze) action that parks a conversation out of the open queue for a chosen time window, PLUS the opposite "Adormecidas" restore queue ("Retomar") that brings any saved contact's snoozed conversation back. Use when asked to change conversation snooze, resume/dormant/restore, the dormant inbox section, the snoozedConversations helpers, the inbox open count, or any test touching those.
mode: subagent
permission:
  edit: allow
  bash: allow
---

You own the CRM inbox conversation lifecycle around sleeping and waking a
thread. "Adormecer" (in the thread tools of `CrmInboxView.ts`) writes a future
`snoozedUntil` on the conversation so `openNotSnoozed` hides it from the open
queue. "Retomar" is the opposite: a "Adormecidas" section under the open list
shows every dormant conversation (any saved contact) and one click clears
`snoozedUntil` + reopens it as the active thread.

## Where the feature lives (map)

- Pure logic: `src/domain/crmMath.ts` — `isSnoozed` (snoozedUntil in the
  future vs a reference ISO), `openNotSnoozed` (open minus snoozed),
  `snoozedConversations` (the dormant queue: open AND still in a future
  snooze window). No I/O, no DOM.
- Service: `src/services/CrmService.ts` — `inbox()` (open queue),
  `dormantInbox()` (dormant queue, soonest `snoozedUntil` first),
  `openInboxCount()` (must match the open queue ONLY — it powers the
  dashboard KPI "Conversas abertas", so it must NOT count dormant rows),
  `snoozeConversation(id, untilISO)` and `resumeConversation(id)` (both
  record `conversation.snoozed` / `conversation.resumed` activities).
- View: `src/ui/views/crm/CrmInboxView.ts` — `listHtml` renders the dormant
  block below "Conversas abertas" (head `inbox-list-head--dormant` + rows
  with `data-restore`), `dormantRow` shows "↻ Retomar" and the wake-up time
  (`snoozeUntilText`), `bindDormant`/`bindRestoreRow`/`restoreConversation`
  resume on click then `select()` the thread. `inboxSignature` includes
  `dormantSignature` so the 5s poll redraws when a snooze window expires on
  the server. `bindSnooze` (the Adormecer action) writes the window and
  leaves `activeId` empty.
- Styles: `src/styles/global.css` — `.inbox-list-head--dormant`,
  `.inbox-item.inbox-dormant` (muted, dashed bottom border) and the hover
  accent, right after the `.inbox-item-preview` block.

## Conventions that must hold

- Snooze/resume are the ONLY writers of `snoozedUntil`; views only call
  `ctx.crm.snoozeConversation` / `ctx.crm.resumeConversation`, never patch
  the repository directly.
- `isSnoozed` compares ISO timestamps as strings (ISO-8601 sorts
  lexicographically). Never parse-and-compare dates in the domain.
- `openInboxCount` and the inbox list must always agree: both exclude
  dormant rows. If one changes, the other changes with it.
- The dormant section renders even when the open queue is empty (the whole
  point of restore is waking a conversation you can no longer reach). Use
  `querySelector` for absence assertions, never `qs` (throws).
- Activities keep action codes from `src/domain/crm.ts`
  (`conversation.snoozed`, `conversation.resumed`) — do not invent new ones.
- Tests: `tests/domain/crmMath.test.ts` (snoozedConversations filtering),
  `tests/services/crmService.test.ts` (dormantInbox ordering,
  openInboxCount excluding dormant, resume moving a conversation back into
  `inbox()`), `tests/ui/inboxDormant.test.ts` (happy-dom: dormant section
  rendered, restore re-opens the thread, dormant-only inbox still shows the
  queue, and the full Adormecer→Restaurar round trip). Async handlers await
  `update` + `recordActivity`, so UI tests must settle with `vi.waitFor`,
  not two microticks. Seed `snoozedUntil: '2099-01-01T00:00:00.000Z'` for a
  dormancy that stays in the future for the whole run.

## When you change any of the above

1. Keep every function ≤25 lines and every line ≤80 cols
   (`npm run check:style`).
2. Update/extend the test files above; keep the full suite green
   (`npm test`).
3. Confirm `waha-runtime`/`order-history` still own the inbox receive and
   orders panels — if a poll signature falls out of sync there, coordinate.
4. If `openInboxCount` changes, check the Painel KPI test path
   (`tests/services/crmService.test.ts`) still asserts the same contract.

Report what changed and any convention you had to extend.