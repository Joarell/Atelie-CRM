// WhatsApp/WAHA ingestion + send, re-exported from the cohesive modules
// below so the module path (`src/server/wahaIngest`) and its public surface
// stay frozen for the webhook handler and the tests.
//
// Two rules carried over from the reference app (`lib/waha/ingest.ts`):
//   - dedup by `externalId` (full AND bare forms) — WAHA emits both `message`
//     and `message.any` for the same message;
//   - contact name is taken from `_data.notifyName` ONLY for inbound messages
//     — the outbound echo must not baptize the contact with the store name.

export type { WahaMessageRow } from './wahaMessage';
export {
  insertWahaMessage,
  messageByWahaId,
  bareIdOf
} from './wahaMessage';
export {
  ensureWahaContact,
  ensureWahaConversation,
  phoneOf
} from './wahaContact';
export {
  handleInboundMessage,
  handleOutboundEcho,
  handleWahaAck,
  handleWahaEdited,
  handleWahaRevoked,
  handleWahaSessionStatus,
  mirrorWahaSessionState,
  dispatchWahaEvent
} from './wahaDispatch';
export {
  sendWahaText,
  sendChatIdFor,
  WahaSendError,
  type SendWahaTextInput
} from './wahaSend';