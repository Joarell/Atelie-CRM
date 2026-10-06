// happy-dom ships no EventSource, and the obvious filler (`eventsource`)
// resolves our relative `/api/crm/events` against happy-dom's default origin
// -- http://localhost:3000, which in dev is the LIVE WAHA engine. Every view
// that opens a stream then holds a real socket to it and aborts it at teardown,
// burying genuine failures under ECONNRESET noise. No unit test needs a live
// stream, so tests get a recorder that records the URL and never connects.
class InertEventSource extends EventTarget {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 2;
	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSED = 2;
	readonly url: string;
	readyState = InertEventSource.CONNECTING;
	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;

	constructor(url: string) {
		super();
		this.url = url;
	}

	close(): void {
		this.readyState = InertEventSource.CLOSED;
	}
}

if (typeof globalThis.EventSource === 'undefined') {
	globalThis.EventSource =
		InertEventSource as unknown as typeof globalThis.EventSource;
}
