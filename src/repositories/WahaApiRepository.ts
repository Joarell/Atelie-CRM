import type { Message } from "../domain/crm";
import type { WahaHealth, WahaSessionSnapshot } from "../domain/whatsapp";
import type { WahaWebhookReadiness } from "../domain/wahaWebhookConfig";

// Non-collection repository for the WAHA connection surface: session
// lifecycle (status/QR, start, stop) and the outbound send. All of it sits
// BEHIND the middleware session guard — AC-119 pulled the session route out of
// `PUBLIC_PATHS`, and AC-127 blocks the whole API until a first-access
// password rotation — so the pairing QR needs an admin session by design.
// Only the send maps its 401 to a dedicated auth signal instead of blaming
// the engine, and keeps the bearer token — supplied through a tiny callback.
export interface WahaSessionState {
	configured: boolean;
	health: WahaHealth | null;
	session: WahaSessionSnapshot | null;
	webhook: WahaWebhookReadiness;
};

// A 401 from the app's own /api/whatsapp/send means the app session is gone
// (expired or never started), NOT that the WAHA engine is down. The view shows
// a login hint instead of blaming the engine.
export class WahaAuthError extends Error {
	constructor() {
		super("waha_autenticacao");
		this.name = "WahaAuthError";
	}
}

export class WahaApiRepository {
	constructor(
		private readonly base = "/api/whatsapp",
		private readonly token: () => string | null = () => null,
	) { }

	async session(): Promise<WahaSessionState> {
		const response = await this.fetchJson("/session");
		const body = (await response.json().catch(() => null)) as
			Partial<WahaSessionState> & { error?: string } | null;
		if (typeof body?.configured !== "boolean") {
			const reason =
				typeof body?.error === "string"
					? body.error
					: `Error ${response.status}`;
			throw new Error(reason);
		}
		return {
			configured: body.configured,
			health: body.health ?? null,
			session: body.session ?? null,
			webhook: body.webhook ?? webhookNotConfigured(),
		};
	};

	async start(): Promise<WahaSessionState> {
		const response = await this.fetchJson("/session", {
			method: "POST",
			body: "{}",
		});
		if (!response.ok) throw new Error(await messageFrom(response));
		const body = (await response.json()) as {
			session: WahaSessionSnapshot;
			webhook?: WahaWebhookReadiness;
		};
		return {
			configured: true,
			health: null,
			session: body.session,
			webhook: body.webhook ?? webhookNotConfigured(),
		};
	};

	async stop(): Promise<boolean> {
		const response = await this.fetchJson("/session", { method: "DELETE" });
		return response.ok;
	};

	async send(
		conversationId: string,
		text: string,
		replyTo?: string,
	): Promise<Message> {
		const body = {
			conversationId,
			text,
			...(replyTo ? { replyTo } : {}),
		};
		const response = await this.fetchJson("/send", {
			method: "POST",
			body: JSON.stringify(body),
		});
		this.requireAuthed(response);
		if (!response.ok) throw new Error(await messageFrom(response));
		const data = (await response.json()) as { message: Message };
		return data.message;
	};

	private requireAuthed(response: Response): void {
		if (response.status === 401) throw new WahaAuthError();
	}

	private fetchJson(path: string, init: RequestInit = {}): Promise<Response> {
		const headers = new Headers(init.headers);
		const token = this.token();
		if (token) headers.set("Authorization", `Bearer ${token}`);
		if (init.body) headers.set("Content-Type", "application/json");
		return fetch(`${this.base}${path}`, { ...init, headers });
	};
};

async function messageFrom(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: string } | null;
		return typeof body?.error === "string"
			? body.error
			: `Error ${response.status}`;
	} catch {
		return `Error ${response.status}`;
	};
};

function webhookNotConfigured(): WahaWebhookReadiness {
	return {
		configured: false,
		registered: false,
		acceptable: false,
		refusal: null,
	};
}
