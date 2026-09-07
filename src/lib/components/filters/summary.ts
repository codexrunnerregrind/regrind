/**
 * The value a collapsed filter row shows: the picks by name while they still
 * fit on one line, a count once they don't.
 */
export function selectionSummary(labels: string[]): string {
	const joined = labels.join(", ");
	return labels.length > 2 || joined.length > 22
		? `${labels.length} selected`
		: joined;
}
