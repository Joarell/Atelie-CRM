import type { IRepository } from './IRepository';

// Same responsibility as the old LocalStorageRepository (cache one
// collection + notify subscribers), but the source of truth is now the
// Cloudflare Worker's /api routes, which read/write Cloudflare D1.
// Nothing outside this class (or ApiSettingsRepository) knows that D1
// exists — services and views only ever see IRepository<T>.
export class ApiRepository<T extends { id: string }> implements IRepository<T> {
	private items: T[] = [];
	private listeners: Array<() => void> = [];

	constructor(
		private readonly endpoint: string,
		private readonly token: () => string | null = () => null
	) {}

	getAll(): T[] {
		return [...this.items];
	}

	getById(id: string): T | undefined {
		return this.items.find((item) => item.id === id);
	}

	async load(): Promise<void> {
		const response = await fetch(this.endpoint, {
			headers: this.authHeaders()
		});
		this.items = response.ok ? await response.json() : [];
		this.notify();
	}

	async add(item: T): Promise<T> {
		const response = await this.postJson(this.endpoint, item);
		const saved: T = await response.json();
		this.items.push(saved);
		this.notify();
		return saved;
	}

	async update(id: string, patch: Partial<T>): Promise<T | undefined> {
		const response = await this.putJson(`${this.endpoint}/${id}`, patch);
		if (!response.ok) return undefined;
		const saved: T = await response.json();
		this.replaceInCache(id, saved);
		this.notify();
		return saved;
	}

	async remove(id: string): Promise<void> {
		await fetch(`${this.endpoint}/${id}`, {
			method: 'DELETE',
			headers: this.authHeaders()
		});
		this.items = this.items.filter((item) => item.id !== id);
		this.notify();
	}

	stash(item: T): void {
		const index = this.items.findIndex(
			(candidate) => candidate.id === item.id
		);
		if (index === -1) this.items.push(item);
		else this.items[index] = item;
		this.notify();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	private replaceInCache(id: string, saved: T): void {
		const index = this.items.findIndex((item) => item.id === id);
		if (index !== -1) this.items[index] = saved;
	}

	private postJson(url: string, body: unknown): Promise<Response> {
		return this.jsonRequest(url, 'POST', body);
	}

	private putJson(url: string, body: unknown): Promise<Response> {
		return this.jsonRequest(url, 'PUT', body);
	}

	private jsonRequest(
		url: string, method: string, body: unknown
	): Promise<Response> {
		const headers = this.authHeaders();
		headers.set('Content-Type', 'application/json');
		return fetch(url, {
			method,
			headers,
			body: JSON.stringify(body)
		});
	}

	private authHeaders(): Headers {
		const headers = new Headers();
		const token = this.token();
		if (token) headers.set('Authorization', `Bearer ${token}`);
		return headers;
	}

	private notify(): void {
		this.listeners.forEach((listener) => listener());
	}
}