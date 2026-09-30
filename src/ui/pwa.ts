import {
	PWA_SW_PATH,
	pwaCacheName,
	type PwaRoute,
	type PwaUrl,
	routeKind
} from '../domain/pwa';

// Minimal service-worker container surface so tests pass a fake instead of
// touching navigator (same pattern as theme.ts / Sidebar.ts storage).
export interface SwContainer {
	register(url: string, opts?: { scope: string }): Promise<unknown>;
	controller: unknown | null;
	addEventListener(type: string, handler: () => void): void;
	removeEventListener(type: string, handler: () => void): void;
}

export interface PwaEnv {
	secure: boolean;
	sw: SwContainer | null;
}

// SW registration is meaningless over plain http (browsers reject the file
// content-type on insecure origins), so short-circuit to `null` there.
export function pwaSupported(env: PwaEnv): boolean {
	return env.secure && env.sw !== null;
}

export async function registerPwa(env: PwaEnv): Promise<unknown> {
	if (!pwaSupported(env)) return null;
	const registration = await env.sw!.register(PWA_SW_PATH, { scope: '/' });
	return registration;
}

// Pure route classification shared with the worker contract tests.
export function classify(url: PwaUrl): PwaRoute {
	return routeKind(url);
}

export function shellCacheName(): string {
	return pwaCacheName();
}