import { describe, it, expect, vi } from "vitest";
import { WhatsappService } from "../../src/services/WhatsappService";
import type {
	WahaApiRepository,
	WahaSessionState,
} from "../../src/repositories/WahaApiRepository";
import { InMemoryRepository } from "../helpers/inMemoryRepository";
import type { Conversation, Message } from "../../src/domain/crm";

class LoadRecordingRepo<T extends { id: string }, > extends InMemoryRepository<T> {
	loadCalls = 0;
	override async load(): Promise<void> {
		this.loadCalls += 1;
	}
}

const conversation = (id: string): Conversation => ({
	id,
	contactId: "c1",
	channel: "whatsapp",
	channelPhone: "5511999999999",
	lastMessageAt: "2026-09-01T00:00:00Z",
	assignedUserId: "",
	status: "open",
	snoozedUntil: "",
	createdAt: "2026-09-01T00:00:00Z",
});

const outboundMessage = (): Message => ({
	id: "m1",
	conversationId: "c1",
	direction: "outbound",
	text: "oi",
	createdBy: "u1",
	createdAt: "2026-09-01T00:00:01Z",
	waStatus: "sent",
	externalId: "SENTID",
});

function harness(waha = fakeWaha()): {
	service: WhatsappService;
	messages: LoadRecordingRepo<Message>;
	conversations: LoadRecordingRepo<Conversation>;
	waha: WahaApiRepository;
} {
	const messages = new LoadRecordingRepo<Message>();
	const conversations = new LoadRecordingRepo<Conversation>();
	const service = new WhatsappService(waha, messages, conversations);
	return { service, messages, conversations, waha };
}

function fakeWaha(): WahaApiRepository {
	return {
		session: vi.fn(
			async () =>
				({
					configured: true,
					health: { healthy: true },
					session: { name: "default", status: "WORKING" },
				}) as WahaSessionState,
		),
		start: vi.fn(
			async () =>
				({
					configured: true,
					health: null,
					session: { name: "default", status: "WORKING" },
				}) as WahaSessionState,
		),
		stop: vi.fn(async () => true),
		send: vi.fn(async () => outboundMessage()),
	} as unknown as WahaApiRepository;
}

describe("WhatsappService", () => {
	it("session() surfaces the repository state", async () => {
		const { service, waha } = harness();
		const state = await service.session();
		expect(state.session).toMatchObject({ status: "WORKING" });
		expect(waha.session).toHaveBeenCalledTimes(1);
	});

	it("start()/stop() delegate to the engine", async () => {
		const { service, waha } = harness();
		expect((await service.start()).session?.status).toBe("WORKING");
		expect(await service.stop()).toBe(true);
		expect(waha.stop).toHaveBeenCalledOnce();
	});

	it("sendText() pushes through the engine and reloads both caches", async () => {
		const { service, messages, conversations, waha } = harness();
		const saved = await service.sendText("c1", "oi");
		expect(waha.send).toHaveBeenCalledWith("c1", "oi", undefined);
		expect(saved.waStatus).toBe("sent");
		expect(messages.loadCalls).toBe(1);
		expect(conversations.loadCalls).toBe(1);
	});

	it("sendText() keeps the sent message in the cache even when the reload fails", async () => {
		const messages = new (class extends InMemoryRepository<Message> {
			override async load(): Promise<void> {
				throw new Error("network");
			}
		})();
		const conversations = new InMemoryRepository<Conversation>();
		const service = new WhatsappService(fakeWaha(), messages, conversations);
		const saved = await service.sendText("c1", "oi");
		expect(saved.id).toBe("m1");
		expect(messages.getById("m1")).toMatchObject({
			direction: "outbound",
			conversationId: "c1",
			text: "oi"
		});
	});

	it("sendText() bumps the conversation's lastMessageAt from the send", async () => {
		const messages = new InMemoryRepository<Message>();
		const conversations = InMemoryRepository.seeded<Conversation>([
			conversation("c1")
		]);
		const service = new WhatsappService(fakeWaha(), messages, conversations);
		await service.sendText("c1", "oi");
		expect(conversations.getById("c1")?.lastMessageAt).toBe(
			"2026-09-01T00:00:01Z"
		);
	});

	it("sendText() forwards a reply id when given", async () => {
		const { service, waha } = harness();
		await service.sendText("c1", "oi", "true_1@c.us_PREV");
		expect(waha.send).toHaveBeenCalledWith("c1", "oi", "true_1@c.us_PREV");
	});

	it("sendText() propagates engine errors", async () => {
		const waha = {
			...fakeWaha(),
			send: vi.fn(async () =>
				Promise.reject(new Error("conversation_not_found")),
			),
		} as unknown as WahaApiRepository;
		const { service } = harness(waha);
		await expect(service.sendText("nope", "oi")).rejects.toThrow(
			"conversation_not_found",
		);
	});

	it("session() degrades gracefully when unconfigured", async () => {
		const waha = {
			session: vi.fn(async () => ({
				configured: false,
				health: null,
				session: null,
			})),
		} as unknown as WahaApiRepository;
		const { service } = harness(waha);
		await expect(service.session()).resolves.toEqual({
			configured: false,
			health: null,
			session: null,
		});
	});
});
