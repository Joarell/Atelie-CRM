export interface SqlStatement {
	sql: string;
	values: unknown[];
}

function pick(
	row: Record<string, unknown>,
	allowed: string[] | undefined
): string[] {
	const keys = Object.keys(row);
	if (!allowed) return keys;
	const keep = new Set(allowed);
	return keys.filter((k) => keep.has(k));
}

export function buildInsert(
	table: string,
	row: Record<string, unknown>,
	allowed?: string[]
): SqlStatement {
	const columns = pick(row, allowed);
	const placeholders = columns.map(() => '?').join(', ');
	const cols = columns.join(', ');
	const sql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`;
	return { sql, values: columns.map((c) => row[c]) };
}

export function buildUpdate(
	table: string,
	id: string,
	row: Record<string, unknown>,
	allowed?: string[]
): SqlStatement {
	const columns = pick(row, allowed);
	const setClause = columns.map((c) => `${c} = ?`).join(', ');
	const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
	return { sql, values: [...columns.map((c) => row[c]), id] };
}