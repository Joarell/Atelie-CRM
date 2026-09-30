import type { Database } from './db';
import { insertEntity, listEntities, getEntity, updateEntity } from './crud';
import { uid, nowISO } from '../domain/format';
import type { ConsentRecord } from '../domain/crm';
import { CONSENT_TABLE, CONSENT_SHAPE } from './tables';

export type { ConsentRecord };

export async function recordConsent(
	db: Database,
	input: Omit<ConsentRecord, 'id' | 'grantedAt'>
): Promise<ConsentRecord> {
	const record: ConsentRecord = {
		...input,
		id: uid(),
		grantedAt: nowISO(),
	};
	await insertEntity(db, CONSENT_TABLE, CONSENT_SHAPE, record);
	return record;
}

export async function withdrawConsent(
	db: Database,
	subjectId: string,
	subjectType: 'user' | 'contact',
	purpose: string
): Promise<void> {
	const consents = await listEntities<ConsentRecord>(
		db, CONSENT_TABLE, CONSENT_SHAPE
	);
	const match = consents.find(c =>
		c.subjectId === subjectId &&
		c.subjectType === subjectType &&
		c.purposes.includes(purpose) &&
		c.status === 'granted'
	);
	if (match) {
		await updateEntity(db, CONSENT_TABLE, CONSENT_SHAPE, match.id, {
			status: 'withdrawn',
			withdrawnAt: nowISO(),
		} as Partial<ConsentRecord>);
	}
}

export async function hasValidConsent(
	db: Database,
	subjectId: string,
	subjectType: 'user' | 'contact',
	purpose: string
): Promise<boolean> {
	const consents = await listEntities<ConsentRecord>(
		db, CONSENT_TABLE, CONSENT_SHAPE
	);
	return consents.some(c =>
		c.subjectId === subjectId &&
		c.subjectType === subjectType &&
		c.purposes.includes(purpose) &&
		c.status === 'granted' &&
		(!c.expiresAt || new Date(c.expiresAt) > new Date())
	);
}

export async function getConsentsForSubject(
	db: Database,
	subjectId: string,
	subjectType: 'user' | 'contact'
): Promise<ConsentRecord[]> {
	const consents = await listEntities<ConsentRecord>(
		db, CONSENT_TABLE, CONSENT_SHAPE
	);
	return consents.filter(
		c => c.subjectId === subjectId && c.subjectType === subjectType
	);
}

export async function grantConsent(
	db: Database,
	subjectId: string,
	subjectType: 'user' | 'contact',
	purposes: string[],
	lawfulBasis: ConsentRecord['lawfulBasis'],
	ip: string,
	userAgent: string,
	expiresAt?: string,
	metadata?: Record<string, unknown>
): Promise<ConsentRecord> {
	// Withdraw any existing consent for these purposes
	for (const purpose of purposes) {
		await withdrawConsent(db, subjectId, subjectType, purpose);
	}

	return recordConsent(db, {
		subjectId,
		subjectType,
		purposes,
		lawfulBasis,
		status: 'granted',
		ip,
		userAgent,
		version: '1.0',
		expiresAt,
		metadata: metadata ?? {},
	});
}