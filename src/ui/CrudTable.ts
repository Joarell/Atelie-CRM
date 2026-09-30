export interface TableColumn<T> {
	header: string;
	render: (item: T) => string;
	alignRight?: boolean;
	alignCenter?: boolean;
}

export interface CrudTableOptions<T> {
	columns: TableColumn<T>[];
	rows: T[];
	actions: (item: T) => string;
	emptyTitle: string;
	emptyHint: string;
	summary?: TableSummary<T>;
}

export interface TableSummary<T> {
	render: (rows: T[]) => string[];
	alignRight?: boolean;
}

export function renderCrudTable<T>(options: CrudTableOptions<T>): string {
	if (options.rows.length === 0) {
		return renderEmptyState(options.emptyTitle, options.emptyHint);
	}
	const summaryHtml = options.summary
		? renderSummaryRow(options.columns, options.summary, options.rows)
		: '';
	return `<div class="table-wrap"><table>
		<thead><tr>${renderHeaderCells(options.columns)}<th></th></tr></thead>
		<tbody>${options.rows
			.map((row) => renderBodyRow(options, row))
			.join('')}</tbody>
		${summaryHtml}
	</table></div>`;
}

export function renderEmptyState(title: string, hint: string): string {
	return (
		'<div class="empty-state"><div class="big">' +
		`${title}</div><p>${hint}</p></div>`
	);
}

function alignAttr(alignRight?: boolean, alignCenter?: boolean): string {
	if (alignCenter) return ' class="text-center"';
	return alignRight ? ' class="text-right num"' : '';
}

function renderHeaderCells<T>(columns: TableColumn<T>[]): string {
	return columns
		.map((col) => `<th class="text-center">${col.header}</th>`)
		.join('');
}

function renderBodyRow<T>(options: CrudTableOptions<T>, row: T): string {
	const cells = options.columns
		.map((col) =>
			`<td${alignAttr(col.alignRight, col.alignCenter)}>${col.render(row)}</td>`
		)
		.join('');
	return `<tr>${cells}<td class="text-right">${options.actions(row)}</td></tr>`;
}

function renderSummaryRow<T>(
	columns: TableColumn<T>[],
	summary: TableSummary<T>,
	rows: T[]
): string {
	const cells = summary.render(rows);
	const cellHtml = cells
		.map((cell, idx) => {
			const col = columns[idx];
			if (col?.alignCenter) return `<td class="text-center">${cell}</td>`;
			if (col?.alignRight) return `<td class="text-right num">${cell}</td>`;
			return `<td>${cell}</td>`;
		})
		.join('');
	return `<tfoot><tr>${cellHtml}<td></td></tr></tfoot>`;
}