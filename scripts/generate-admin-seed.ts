// Guard in front of `db:seed:remote`.
//
// Seeding production creates the admin whose password is published in the
// repository history, so it must never be a single accidental keystroke away.
// The seed itself runs in the npm chain that calls this script; this process
// only decides whether that chain is allowed to proceed.
//
// Acknowledge with:  ALLOW_SEED_ADMIN=1 npm run db:seed:remote
// or pass the flag:   npm run db:seed:remote -- --allow-seed-admin

const ALLOW_FLAG = '--allow-seed-admin';
const ALLOW_ENV = 'ALLOW_SEED_ADMIN';

function acknowledged(argv: string[]): boolean {
	return argv.includes(ALLOW_FLAG) || process.env[ALLOW_ENV] === '1';
}

function refuse(): never {
	console.error(
		[
			'Seed remoto bloqueado: ele recria o admin com a senha do repositorio.',
			`Reexecute com ${ALLOW_ENV}=1 ou com o flag ${ALLOW_FLAG}.`
		].join('\n')
	);
	process.exit(1);
}

if (!acknowledged(process.argv.slice(2))) refuse();
console.log('Seed remoto autorizado: o admin do seed exigira troca de senha.');
