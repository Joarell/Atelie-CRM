import type { APIRoute } from 'astro';
import type { Settings } from '../../domain/types';
import type { Database } from '../../server/db';
import { DEFAULT_SETTINGS } from '../../domain/types';
import { getDb } from '../../server/context';
import { json } from '../../server/http';

const SETTINGS_ID = 'global';

export const GET: APIRoute = async () => {
	const db = getDb();
	const existing = await readSettings(db);
	if (existing) return json(existing);
	await writeSettings(db, DEFAULT_SETTINGS);
	return json(DEFAULT_SETTINGS);
};

export const PUT: APIRoute = async (context) => {
	const db = getDb();
	const patch: Partial<Settings> = await context.request.json();
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