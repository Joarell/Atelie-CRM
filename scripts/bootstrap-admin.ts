/**
 * Cria (ou rotaciona) o primeiro administrador sem credencial known-default.
 *
 * A senha vem de `ADMIN_INITIAL_PASSWORD` ou, se ausente, de uma string aleatoria
 * de uso unico impressa uma vez no stdout. Em ambos os casos a conta nasce com
 * `mustChangePassword = 1`, entao a API responde 403
 * `troca_de_senha_obrigatoria` ate a rotacao — nenhum deploy comeca com login
 * que qualquer pessoa com o repositorio consegue reproduzir.
 *
 * Um banco ainda semeado com a credencial legada e' RECUSADO por padrao: a
 * assercao roda antes de qualquer escrita. A remediacao e' explicita.
 *
 *   npm run admin:bootstrap                      # senha aleatoria
 *   ADMIN_INITIAL_PASSWORD=... npm run admin:bootstrap
 *   npm run admin:bootstrap -- --force           # apaga a linha legada e rotaciona
 */
import { env } from 'cloudflare:workers';
import { getDb } from '../src/server/context';
import {
	bootstrapAdmin,
	SeedCredentialError
} from '../src/server/seedCredential';

const FORCE_FLAG = '--force';

function randomPassword(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	const hex = [...bytes]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `at-${hex.slice(0, 32)}`;
}

async function main(): Promise<void> {
	const db = getDb();
	const fromEnv = env.ADMIN_INITIAL_PASSWORD;
	const result = await bootstrapAdmin(db, {
		fromEnv: typeof fromEnv === 'string' ? fromEnv : undefined,
		randomPassword,
		removeLegacy: process.argv.includes(FORCE_FLAG)
	});

	if (result.legacyRemoved) console.log('· linha de seed legada removida');
	const verb = result.action === 'rotated'
		? 'senha do admin rotacionada'
		: 'admin criado';
	console.log(`· ${verb}: ${result.email}`);
	if (result.passwordSource === 'env') {
		console.log('\n  senha lida de ADMIN_INITIAL_PASSWORD\n');
	} else {
		console.log('\n  senha de uso unico (troque no primeiro acesso):');
		console.log(`  ${result.password}\n`);
	}
}

try {
	await main();
} catch (error) {
	if (error instanceof SeedCredentialError) {
		console.error(`\n  ${error.message}`);
		console.error('  rode de novo com --force para apagar a linha e rotacionar\n');
		process.exit(1);
	}
	throw error;
}
