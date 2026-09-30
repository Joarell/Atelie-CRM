import type { Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';

// Settings are a singleton, not a collection — same shape as before
// (SettingsRepository), just talking to /api/settings (backed by a
// single row in the D1 `settings` table) instead of localStorage.
export class ApiSettingsRepository {
	private value: Settings = DEFAULT_SETTINGS;
	private listeners: Array<() => void> = [];

	constructor(private readonly endpoint: string) {}

	get(): Settings {
		return { ...this.value };
	}

	async load(): Promise<void> {
		const response = await fetch(this.endpoint);
		this.value = response.ok ? await response.json() : DEFAULT_SETTINGS;
		this.notify();
	}

	async update(patch: Partial<Settings>): Promise<Settings> {
		const response = await fetch(this.endpoint, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch)
		});
		const next = response.ok
			? ((await response.json()) as Settings)
			: { ...this.value, ...patch };
		this.value = next;
		this.notify();
		return this.get();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	private notify(): void {
		this.listeners.forEach((listener) => listener());
	}
}