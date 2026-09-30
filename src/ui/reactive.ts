export type Unsubscribe = () => void;

// Subscribes to N sources and re-runs `render` whenever any of them fire.
// Every view uses this the same way, so the wiring never has to be
// copy-pasted (and stays out of business logic entirely).
export function autoRerender(
	render: () => void,
	sources: Array<(cb: () => void) => Unsubscribe>
): Unsubscribe {
	render();
	const unsubs = sources.map((subscribe) => subscribe(render));
	return () => unsubs.forEach((unsub) => unsub());
}