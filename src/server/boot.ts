// Boot-time configuration assertion — runs once per isolate.
// Fails fast with 503 if required configuration is missing or invalid.

import type { Database } from './db';
import { assertNoSeedCredential } from './seedCredential';

let bootChecked = false;
let bootResult: { ok: boolean; error?: string } | null = null;

export async function runBootAssertion(
	db: Database
): Promise<{ ok: boolean; error?: string }> {
	if (bootChecked) return bootResult!;

	try {
		await assertNoSeedCredential(db);
		bootResult = { ok: true };
	} catch (e) {
		bootResult = {
			ok: false,
			error: e instanceof Error
				? e.message
				: 'configuração inválida'
		};
	}
	bootChecked = true;
	return bootResult;
}

export function resetBootForTest(): void {
	bootChecked = false;
	bootResult = null;
}