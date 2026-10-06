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
import { resolve } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import type { Database } from '../src/server/db';
import {
  bootstrapAdmin,
  SeedCredentialError
} from '../src/server/seedCredential';
import type { BootstrapResult } from '../src/server/seedCredential';

const FORCE_FLAG = '--force';

// `wrangler d1 execute --local` grava em `.wrangler/state/v3/d1`, que e' o
// mesmo banco que `astro dev` le. getPlatformProxy usaria um diretorio
// temporario por padrao e o admin nasceria num banco que o app nunca enxerga.
const PERSIST_DIR = '.wrangler/state/v3';

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const hex = [...bytes]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `at-${hex.slice(0, 32)}`;
}

// O binding tem prioridade porque e' de onde `wrangler` le as vars; o
// process.env cobre quem/exporta a variavel sem passar pelo arquivo .dev.vars.
function adminPasswordFrom(env: Record<string, unknown>): string | undefined {
  const fromBinding = env.ADMIN_INITIAL_PASSWORD;
  if (typeof fromBinding === 'string') return fromBinding;
  const fromProcess = process.env.ADMIN_INITIAL_PASSWORD;
  return typeof fromProcess === 'string' ? fromProcess : undefined;
}

function report(result: BootstrapResult): void {
  if (result.legacyRemoved) console.log('· linha de seed legada removida');
  const verb = result.action === 'rotated'
    ? 'senha do admin rotacionada'
    : 'admin criado';
  console.log(`· ${verb}: ${result.email}`);
  if (result.passwordSource === 'env') {
    console.log('\n  senha lida de ADMIN_INITIAL_PASSWORD\n');
    return;
  }
  console.log('\n  senha de uso unico (troque no primeiro acesso):');
  console.log(`  ${result.password}\n`);
}

async function main(): Promise<void> {
  const proxy = await getPlatformProxy({
    persist: { path: resolve(process.cwd(), PERSIST_DIR) }
  });
  try {
    const result = await bootstrapAdmin(
      proxy.env.DB as unknown as Database,
      {
        fromEnv: adminPasswordFrom(proxy.env),
        randomPassword,
        removeLegacy: process.argv.includes(FORCE_FLAG)
      }
    );
    report(result);
  } finally {
    await proxy.dispose();
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
