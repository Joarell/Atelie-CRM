export type RouteHandler = () => void;

// Tiny hash router: one responsibility (map #/route -> handler).
// Views register themselves; Router doesn't know anything about them.
export class Router {
	private routes = new Map<string, RouteHandler>();
	private fallback: RouteHandler | null = null;

	register(path: string, handler: RouteHandler): void {
		this.routes.set(path, handler);
	}

	setFallback(handler: RouteHandler): void {
		this.fallback = handler;
	}

	start(): void {
		window.addEventListener('hashchange', () => this.resolve());
		this.resolve();
	}

	currentPath(): string {
		return window.location.hash.replace(/^#/, '') || '/';
	}

	private resolve(): void {
		const path = this.currentPath();
		const handler = this.routes.get(path);
		(handler ?? this.fallback ?? (() => {}))();
	}
}
