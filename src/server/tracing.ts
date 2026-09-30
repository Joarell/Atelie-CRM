import type { Database } from './db';
import { insertEntity } from './crud';
import { ACTION_LOGS_TABLE, ACTION_LOGS_SHAPE } from './tables';
import { uid, nowISO } from '../domain/format';

export interface ActionLogEntry {
	id: string;
	clientId: string;
	userId: string;
	action: string;
	detail: string;
	metadata: Record<string, unknown>;
	ip: string;
	createdAt: string;
}

export interface RequestHeaders {
	headers: Headers;
}

export function newActionLogEntry(
	clientId: string,
	userId: string,
	action: string,
	detail = '',
	metadata: Record<string, unknown> = {},
	ip = ''
): ActionLogEntry {
	return {
		id: uid(),
		clientId,
		userId,
		action,
		detail,
		metadata,
		ip,
		createdAt: nowISO()
	};
}

export async function recordActionLog(
	db: Database,
	entry: ActionLogEntry
): Promise<void> {
	await insertEntity<ActionLogEntry>(
		db, ACTION_LOGS_TABLE, ACTION_LOGS_SHAPE, entry
	);
}

export function getClientIdFromRequest(request: RequestHeaders): string {
	return request.headers.get('x-client-id') ?? 'default';
}

export function getUserIdFromRequest(request: RequestHeaders): string {
	const auth = request.headers.get('authorization');
	if (!auth?.startsWith('Bearer ')) return '';
	return auth.slice(7);
}

interface TraceOptions {
	getDetail?: (args: unknown[], result: unknown) => string;
	getMetadata?: (args: unknown[], result: unknown) => Record<string, unknown>;
	clientIdKey?: string;
}

function buildDetail(
	options: TraceOptions,
	args: unknown[],
	result: unknown,
	error: Error | null,
	propertyKey: string,
	durationMs: number
): string {
	if (options.getDetail) return options.getDetail(args, result ?? error);
	const status = error ? 'failed' : 'succeeded';
	return `${propertyKey} ${status} in ${durationMs}ms`;
}

function buildMetadata(
	options: TraceOptions,
	args: unknown[],
	result: unknown,
	error: Error | null,
	propertyKey: string,
	durationMs: number
): Record<string, unknown> {
	if (options.getMetadata) return options.getMetadata(args, result ?? error);
	return { durationMs, method: propertyKey, class: 'TracedClass' };
}

function getClientId(
	options: TraceOptions,
	args: unknown[]
): string {
	if (!options.clientIdKey) return 'default';
	const rec = args[0] as Record<string, unknown>;
	return rec?.[options.clientIdKey] as string ?? 'default';
}

async function logAction(
	db: Database,
	clientId: string,
	userId: string,
	action: string,
	detail: string,
	metadata: Record<string, unknown>,
	ip: string
): Promise<void> {
	const entry = newActionLogEntry(
		clientId, userId, action, detail, metadata, ip
	);
	try {
		await recordActionLog(db, entry);
	} catch {
		// Silently ignore logging failures
	}
}

function extractContext(): {
	db: Database | null;
	userId: string;
	ip: string
} {
	if (typeof globalThis === 'undefined') {
		return { db: null, userId: '', ip: '' };
	}
	const g = globalThis as any;
	if (!g.__db) return { db: null, userId: '', ip: '' };
	return {
		db: g.__db as Database,
		userId: g.__userId as string ?? '',
		ip: g.__ip as string ?? ''
	};
}

async function handleFinally(
	action: string,
	options: TraceOptions,
	args: unknown[],
	result: unknown,
	error: Error | null,
	propertyKey: string,
	startTime: number
): Promise<void> {
	const durationMs = Date.now() - startTime;
	const detail = buildDetail(
		options, args, result, error, propertyKey, durationMs
	);
	const metadata = buildMetadata(
		options, args, result, error, propertyKey, durationMs
	);
	const clientId = getClientId(options, args);
	const { db, userId, ip } = extractContext();
	if (!db) return;
	await logAction(db, clientId, userId, action, detail, metadata, ip);
}

function createAsyncWrapper(
	originalMethod: Function,
	propertyKey: string,
	action: string,
	options: TraceOptions
) {
	return async function (this: any, ...args: unknown[]) {
		const startTime = Date.now();
		let result: unknown;
		let error: Error | null = null;

		try {
			result = await originalMethod.apply(this, args);
			return result;
		} catch (e) {
			error = e instanceof Error ? e : new Error(String(e));
			throw error;
} finally {
		await handleFinally(
			action, options, args, result, error, propertyKey, startTime
		);
	}
};
}

function createSyncWrapper(
	originalMethod: Function,
	propertyKey: string,
	action: string,
	options: TraceOptions
) {
	return function (this: any, ...args: unknown[]) {
		const startTime = Date.now();
		let result: unknown;
		let error: Error | null = null;

		try {
			result = originalMethod.apply(this, args);
			return result;
		} catch (e) {
			error = e instanceof Error ? e : new Error(String(e));
			throw error;
} finally {
		handleFinally(
			action, options, args, result, error, propertyKey, startTime
		).catch(() => {});
	}
};
}

// TypeScript decorator for tracing critical method executions
// (experimental decorators)
export function TraceAction(
	action: string,
	options: TraceOptions = {}
) {
	return function (
		target: Object,
		propertyKey: string,
		descriptor: TypedPropertyDescriptor<any>
	): TypedPropertyDescriptor<any> {
		const originalMethod = descriptor.value;
		descriptor.value = createAsyncWrapper(
		originalMethod, propertyKey, action, options
	);
		return descriptor;
	};
}

// Decorator for synchronous methods
export function TraceActionSync(
	action: string,
	options: TraceOptions = {}
) {
	return function (
		target: Object,
		propertyKey: string,
		descriptor: TypedPropertyDescriptor<any>
	): TypedPropertyDescriptor<any> {
		const originalMethod = descriptor.value;
		descriptor.value = createSyncWrapper(
		originalMethod, propertyKey, action, options
	);
		return descriptor;
	};
}