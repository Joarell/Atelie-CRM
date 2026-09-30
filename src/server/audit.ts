import type { Database } from './db';
import { insertEntity } from './crud';
import { AUTH_AUDIT_TABLE, AUTH_AUDIT_SHAPE } from './tables';
import { uid, nowISO } from '../domain/format';

export interface AuditEntry {
	id: string;
	userId: string;
	action: string;
	detail: string;
	ip: string;
	createdAt: string;
}

export function newAuditEntry(
	userId: string,
	action: string,
	detail = '',
	ip = ''
): AuditEntry {
	return {
		id: uid(),
		userId,
		action,
		detail,
		ip,
		createdAt: nowISO()
	};
}

export async function recordAudit(
	db: Database,
	entry: AuditEntry
): Promise<void> {
	await insertEntity<AuditEntry>(
		db, AUTH_AUDIT_TABLE, AUTH_AUDIT_SHAPE, entry
	);
}

export interface RequestHeaders {
	headers: Headers;
}

export function clientIp(request: RequestHeaders): string {
	return request.headers.get('cf-connecting-ip') ?? '';
}