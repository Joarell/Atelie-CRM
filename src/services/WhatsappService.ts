import type { IRepository } from '../repositories/IRepository';
import type { Conversation, Message } from '../domain/crm';
import type { WahaSessionState } from '../repositories/WahaApiRepository';

// Narrow port for the WAHA engine surface this service needs. The concrete
// WahaApiRepository satisfies it structurally (DIP): the service depends on
// the interface, not the repository, and tests can hand it a tiny fake.
export interface WahaGateway {
	session(): Promise<WahaSessionState>;
	start(): Promise<WahaSessionState>;
	stop(): Promise<boolean>;
	send(conversationId: string, text: string, replyTo?: string): Promise<Message>;
}

// Orchestrates the WAHA connection + outbound send for the views. Sends go
// through the engine (the row is persisted by the server as queued→sent with
// the engine's external id), then the in-memory caches are reloaded so the
// inbox and the WhatsApp view agree with D1.
export class WhatsappService {
	constructor(
		private readonly waha: WahaGateway,
		private readonly messages: IRepository<Message>,
		private readonly conversations: IRepository<Conversation>
	) { };

	async session(): Promise<WahaSessionState> {
		return this.waha.session();
	};

	async start(): Promise<WahaSessionState> {
		return this.waha.start();
	};

	async stop(): Promise<boolean> {
		return this.waha.stop();
	};

	async sendText(
		conversationId: string, text: string, replyTo?: string
	): Promise<Message> {
		const message = await this.waha.send(conversationId, text, replyTo);
		this.messages.stash(message);
		this.stashConversationTouch(conversationId, message.createdAt);
		await this.reloadCaches();
		return message;
	};

	private stashConversationTouch(conversationId: string, at: string): void {
		const conversation = this.conversations.getById(conversationId);
		if (!conversation) return;
		this.conversations.stash({ ...conversation, lastMessageAt: at });
	}

	private async reloadCaches(): Promise<void> {
		try {
			await Promise.all([this.messages.load(), this.conversations.load()]);
		} catch {
			// Best-effort refresh: the stash already made the send visible, so
			// a flaky reload must not turn a successful send into a toast.
		}
	}
};
