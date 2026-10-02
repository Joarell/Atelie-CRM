import type { User } from '../domain/crm';

const USER_KEY = 'crm_user';

// Thin client for the /api/auth/* + /api/users endpoints. The session
// token lives in an HttpOnly cookie set by the server, so no script on this
// origin can read it — an HTML injection cannot escalate into session
// theft. A `currentUser` cache plus a small listener set lets views
// re-render when the session changes; the cache holds only non-sensitive
// profile fields.
export class ApiAuthRepository {
	private user: User | null = null;
	private listeners: Array<() => void> = [];

	constructor(private readonly userKey = USER_KEY) {}

	token(): string | null {
		return null;
	}

	currentUser(): User | null {
		return this.user;
	}

	isAuthenticated(): boolean {
		return Boolean(this.user);
	}

	async load(): Promise<void> {
		this.user = readStoredUser(this.userKey);
		const response = await fetch('/api/auth/me');
		if (!response.ok) {
			this.clear();
			return;
		}
		const user = (await response.json()) as User;
		this.user = user;
		writeStoredUser(this.userKey, user);
		this.notify();
	}

	async login(email: string, password: string): Promise<User> {
		const response = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password })
		});
		if (!response.ok) throw new Error(await messageFrom(response));
		const { user } = (await response.json()) as { user: User };
		this.user = user;
		writeStoredUser(this.userKey, user);
		this.notify();
		return user;
	}

	async changePassword(
		currentPassword: string,
		newPassword: string
	): Promise<void> {
		const response = await fetch('/api/auth/change-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ currentPassword, newPassword })
		});
		if (!response.ok) throw new Error(await messageFrom(response));
	}

	async logout(): Promise<void> {
		this.clear();
		await fetch('/api/auth/logout', { method: 'POST' });
	}

	private clear(): void {
		localStorage.removeItem(this.userKey);
		this.user = null;
		this.notify();
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

function readStoredUser(key: string): User | null {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as User) : null;
	} catch {
		return null;
	}
}

function writeStoredUser(key: string, user: User): void {
	localStorage.setItem(key, JSON.stringify(user));
}

async function messageFrom(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: string } | null;
		return typeof body?.error === 'string'
			? body.error
			: `Erro ${response.status}`;
	} catch {
		return `Erro ${response.status}`;
	}
}