export interface SqlStatement {
	sql: string;
	values: unknown[];
}

export function buildInsert(
	table: string,
	row: Record<string, unknown>
): SqlStatement {
	const columns = Object.keys(row);
	const placeholders = columns.map(() => '?').join(', ');
	const cols = columns.join(', ');
	const sql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`;
	return { sql, values: columns.map((c) => row[c]) };
}

export function buildUpdate(
	table: string,
	id: string,
	row: Record<string, unknown>
): SqlStatement {
	const columns = Object.keys(row);
	const setClause = columns.map((c) => `${c} = ?`).join(', ');
	const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
	return { sql, values: [...columns.map((c) => row[c]), id] };
}