import type { APIRoute } from 'astro';
import type { Settings } from '../../domain/types';
import type { Role } from '../../domain/crm';
import type { Database } from '../../server/db';
import { DEFAULT_SETTINGS } from '../../domain/types';
import { getDb } from '../../server/context';
import { requireRole } from '../../server/authz';
import { json } from '../../server/http';

const SETTINGS_ID = 'global';
const SETTINGS_MANAGERS: Role[] = ['admin', 'manager'];

// Allowlist de colunas. `settings` e' a unica tabela sem `shape.columns`,
// entao o merge aceitaria qualquer chave — inclusive nomes de coluna que a
// tabela nao tem, que viravam `INSERT OR REPLACE` para uma coluna
// inexistente. Aqui o patch e' filtrado e convertido para numero antes do
// merge.
const SETTINGS_FIELDS = [
	'salary',
	'daysPerMonth',
	'hoursPerDay',
	'rent',
	'energy',
	'water',
	'internet',
	'office',
	'mei',
	'variablePercent',
	'defaultMarkupPercent',
] as const satisfies readonly (keyof Settings)[];

function sanitizeSettingsPatch(raw: unknown): Partial<Settings> {
	if (!raw || typeof raw !== 'object') return {};
	const source = raw as Record<string, unknown>;
	const patch: Record<string, unknown> = {};
	for (const key of SETTINGS_FIELDS) {
		const value = source[key];
		if (value === undefined || value === null) continue;
		const n = typeof value === 'number' ? value : Number(value);
		if (!Number.isFinite(n)) continue;
		patch[key] = n;
	}
	return patch as Partial<Settings>;
}

// GET e' somente leitura: a linha nasce em migrations/0022. Antes, um GET em
// banco sem configuracao fazia INSERT — estado mudando em resposta a um read.
export const GET: APIRoute = async () => {
	const existing = await readSettings(getDb());
	return json(existing ?? DEFAULT_SETTINGS);
};

export const PUT: APIRoute = async (context) => {
	const denied = await requireRole(context, SETTINGS_MANAGERS);
	if (denied) return denied;
	const db = getDb();
	const patch = sanitizeSettingsPatch(await context.request.json());
	const current = (await readSettings(db)) ?? DEFAULT_SETTINGS;
	const merged = { ...current, ...patch };
	await writeSettings(db, merged);
	return json(merged);
};

async function readSettings(db: Database): Promise<Settings | null> {
	const row = await db
		.prepare('SELECT * FROM settings WHERE id = ?')
		.bind(SETTINGS_ID)
		.first<Record<string, unknown>>();
	if (!row) return null;
	const { id, ...settings } = row;
	return settings as unknown as Settings;
}

async function writeSettings(db: Database, settings: Settings): Promise<void> {
	const columns = Object.keys(settings);
	const settingsRecord = settings as unknown as Record<string, unknown>;
	const values = columns.map((c) => settingsRecord[c]);
	const placeholders = columns.map(() => '?').join(', ');
	const columnList = columns.join(', ');
	const sql =
		`INSERT OR REPLACE INTO settings (id, ${columnList}) ` +
		`VALUES (?, ${placeholders})`;
	await db.prepare(sql).bind(SETTINGS_ID, ...values).run();
}