import { EventSource } from 'eventsource';

// Polyfill EventSource for tests (happy-dom doesn't provide it)
if (typeof globalThis.EventSource === 'undefined') {
  globalThis.EventSource = EventSource as unknown as typeof EventSource;
}