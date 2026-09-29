import type { User } from '../domain/crm';

const TOKEN_KEY = 'crm_token';
const USER_KEY = 'crm_user';

// Thin client for the /api/auth/* + /api/users endpoints. The Bearer
// token lives in localStorage (simple local auth, per the agreed scope);
// a `currentUser` cache plus a small listener set lets views re-render
// when the session changes.
export class ApiAuthRepository {
  private user: User | null = null;
  private listeners: Array<() => void> = [];

  constructor(
    private readonly tokenKey = TOKEN_KEY,
    private readonly userKey = USER_KEY
  ) {}

  token(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  currentUser(): User | null {
    return this.user;
  }

  isAuthenticated(): boolean {
    return Boolean(this.user) && Boolean(this.token());
  }

  async load(): Promise<void> {
    this.user = readStoredUser(this.userKey);
    if (!this.token()) return;
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${this.token()}` }
    });
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
    const data = (await response.json()) as { token: string; user: User };
    const { token, user } = data;
    localStorage.setItem(this.tokenKey, token);
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token()}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!response.ok) throw new Error(await messageFrom(response));
  }

  async logout(): Promise<void> {
    const token = this.token();
    this.clear();
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    }
  }

  private clear(): void {
    localStorage.removeItem(this.tokenKey);
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