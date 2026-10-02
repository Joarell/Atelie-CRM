// D1 (SQLite) has no native JSON or boolean type: nested objects/arrays
// are stored as TEXT (JSON-encoded) and booleans as 0/1 integers. These
// two small, single-purpose functions are the only place that knows that.
export interface TableShape {
	jsonFields?: string[];
	boolFields?: string[];
	// Colunas REAL/INTEGER. SQLite aceita texto em uma coluna REAL (affinity) e
	// persiste `'abc'` como texto, entao a validacao de tipo precisa acontecer
	// antes do INSERT/UPDATE — nao depois, quando ja gravou.
	numberFields?: string[];
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
	const out = coerceNumbers(keepAllowed(entity, shape.columns), shape);
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

// Campos declarados como numericos cujo valor recebido nao vira numero finito.
// `null`/`undefined` ficam de fora: ausente nao e erro de tipo, e `''` tambem
// nao e (um input vazio deve cair no DEFAULT do schema, nao virar NaN).
export function numericProblems(
	entity: Record<string, unknown>,
	shape: TableShape
): string[] {
	const bad: string[] = [];
	for (const field of shape.numberFields ?? []) {
		const value = entity[field];
		if (value === undefined || value === null || value === '') continue;
		if (!isFiniteNumber(value)) bad.push(field);
	}
	return bad;
}

function isFiniteNumber(value: unknown): boolean {
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value !== 'string') return false;
	return Number.isFinite(Number(value.trim()));
}

// Coage para numero (o patch vem de `formValues`, ou seja, texto). Um valor que
// nao coage e descartado: nunca chega ao SQL como texto.
export function coerceNumbers(
	row: Record<string, unknown>,
	shape: TableShape
): Record<string, unknown> {
	const out = { ...row };
	for (const field of shape.numberFields ?? []) {
		const value = out[field];
		if (value === undefined) continue;
		if (isFiniteNumber(value)) {
			out[field] = typeof value === 'number'
				? value
				: Number(String(value).trim());
		} else {
			delete out[field];
		}
	}
	return out;
}
