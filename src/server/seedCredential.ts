import type { Database } from './db';
import type { User } from '../domain/crm';
import {
	getEntity, listEntities, insertEntity, updateEntity
} from './crud';
import { USERS_TABLE, USERS_SHAPE } from './tables';
import { hashPassword } from './auth';
import { uid, nowISO } from '../domain/format';

// The seeded admin used to be `admin@deskcomm.local` / `admin123` hashed
// with the fixed salt `deskcomm-seed-v1` (both published in the repository,
// so the credential was replayable by anyone with a clone). The seed no
// longer writes a password and `verifyPassword` has no fixed-salt
// fallback, but databases seeded before that change still carry the row —
// so the hash is pinned here purely to DETECT and refuse it. It is a
// fingerprint, never a way in.
export const LEGACY_SEED_HASH =
	'022d504d3b3433f2cde7ac9185a4e1d340e67ed70a943dbc4ef14bf8c3174a00';

export const LEGACY_SEED_EMAIL = 'admin@deskcomm.local';

export class SeedCredentialError extends Error {
	constructor(public readonly email: string) {
		super(
			`credencial de seed reproduzivel presente (${email}): ` +
			'rode `npm run admin:bootstrap` para rotacionar antes de subir'
		);
		this.name = 'SeedCredentialError';
	}
}

export function isLegacySeedHash(hash: string): boolean {
	return hash === LEGACY_SEED_HASH;
}

// Fail-closed: refuses to continue while a replayable admin credential exists.
export async function assertNoSeedCredential(db: Database): Promise<void> {
	const users = await listEntities<{ email: string; passwordHash: string }>(
		db, USERS_TABLE, USERS_SHAPE
	);
	const offender = users.find((user) => isLegacySeedHash(user.passwordHash));
	if (offender) throw new SeedCredentialError(offender.email);
}

// Rotation path for a database that still carries the legacy row.
export async function deleteLegacySeedAdmin(db: Database): Promise<boolean> {
	const user = await getEntity<{ id: string; passwordHash: string }>(
		db, USERS_TABLE, USERS_SHAPE, 'seed-user-admin'
	);
	if (!user || !isLegacySeedHash(user.passwordHash)) return false;
	await db
		.prepare(`DELETE FROM ${USERS_TABLE} WHERE id = ?`)
		.bind(user.id)
		.run();
	return true;
}


export const BOOTSTRAP_EMAIL = 'admin@deskcomm.local';

const MIN_PASSWORD_LENGTH = 12;

export type BootstrapResult = {
	action: 'created' | 'rotated';
	email: string;
	password: string;
	passwordSource: 'env' | 'random';
	legacyRemoved: boolean;
};

export type BootstrapOptions = {
	fromEnv?: string;
	randomPassword: () => string;
	removeLegacy?: boolean;
};

// A ordem aqui e' o ponto: a asserção roda ANTES de qualquer escrita. Chamar
// `assertNoSeedCredential` depois de apagar a linha legado a tornaria código
// morto — ela nunca encontraria o hash, porque ele já tinha sido removido.
export async function bootstrapAdmin(
	db: Database,
	options: BootstrapOptions
): Promise<BootstrapResult> {
	const legacyRemoved = options.removeLegacy === true
		? await deleteLegacySeedAdmin(db)
		: false;
	await assertNoSeedCredential(db);
	return writeAdmin(db, options, legacyRemoved);
}

async function writeAdmin(
	db: Database,
	options: BootstrapOptions,
	legacyRemoved: boolean
): Promise<BootstrapResult> {
	const fromEnv = options.fromEnv;
	const useEnv = typeof fromEnv === 'string'
		&& fromEnv.length >= MIN_PASSWORD_LENGTH;
	const password = useEnv ? fromEnv : options.randomPassword();
	const digest = await hashPassword(password);
	const action = await persistAdmin(db, digest);
	return {
		action,
		email: BOOTSTRAP_EMAIL,
		password,
		passwordSource: useEnv ? 'env' : 'random',
		legacyRemoved
	};
}

async function persistAdmin(
	db: Database,
	digest: { hash: string; salt: string }
): Promise<'created' | 'rotated'> {
	const users = await listEntities<User>(db, USERS_TABLE, USERS_SHAPE);
	const existing = users.find((u) => u.email === BOOTSTRAP_EMAIL);
	const password = {
		passwordHash: digest.hash,
		passwordSalt: digest.salt,
		mustChangePassword: 1
	};
	if (existing) {
		await updateEntity<User>(
			db, USERS_TABLE, USERS_SHAPE, existing.id, password
		);
		return 'rotated';
	}
	await insertEntity(db, USERS_TABLE, USERS_SHAPE, {
		id: uid(),
		name: 'Administrador',
		email: BOOTSTRAP_EMAIL,
		role: 'admin',
		createdAt: nowISO(),
		...password
	});
	return 'created';
}
