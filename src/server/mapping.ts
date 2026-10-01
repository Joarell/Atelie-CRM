// D1 (SQLite) has no native JSON or boolean type: nested objects/arrays
// are stored as TEXT (JSON-encoded) and booleans as 0/1 integers. These
// two small, single-purpose functions are the only place that knows that.
export interface TableShape {
	jsonFields?: string[];
	boolFields?: string[];
	// Columns this table really has. `entityToRow` drops every key outside
	// this list, so a client cannot smuggle a column name — and SQL text —
	// into an INSERT/UPDATE. Omitting `columns` stays permissive; only
	// `settings` does that, because its route has no shape of its own.
	columns?: string[];
}

export function rowToEntity<T>(
	row: Record<string, unknown>,
	shape: TableShape
): T {
	const out: Record<string, unknown> = { ...row };
	for (const field of shape.jsonFields ?? []) {
		if (typeof out[field] === 'string') {
			try {
				out[field] = JSON.parse(out[field] as string);
			} catch {
				// Keep the raw value when the stored text is not valid JSON.
			}
		}
	}
	for (const field of shape.boolFields ?? []) {
		out[field] = Boolean(out[field]);
	}
	return out as T;
}

export function entityToRow(
	entity: Record<string, unknown>,
	shape: TableShape
): Record<string, unknown> {
	const out = keepAllowed(entity, shape.columns);
	for (const field of shape.jsonFields ?? []) {
		if (field in out) out[field] = JSON.stringify(out[field]);
	}
	for (const field of shape.boolFields ?? []) {
		if (field in out) out[field] = out[field] ? 1 : 0;
	}
	return out;
}

function keepAllowed(
	entity: Record<string, unknown>,
	columns: string[] | undefined
): Record<string, unknown> {
	if (!columns) return { ...entity };
	const allowed = new Set(columns);
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(entity)) {
		if (allowed.has(key)) out[key] = value;
	}
	return out;
}