import z from "zod";

// `score` is as of `at`; it halves every half-life after that.
export const mediaSendSchema = z.object({ score: z.number(), at: z.number() });
export type MediaSend = z.infer<typeof mediaSendSchema>;
export type MediaSends = Record<string, MediaSend>;

const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;

export function decayedScore(send: MediaSend | undefined, now: number): number {
	if (send === undefined) return 0;
	return send.score * 2 ** (-Math.max(0, now - send.at) / HALF_LIFE_MS);
}

function prune(sends: MediaSends, now: number): MediaSends {
	const entries = Object.entries(sends);
	if (entries.length <= MAX_ENTRIES) return sends;
	return Object.fromEntries(
		entries
			.sort(([, a], [, b]) => decayedScore(b, now) - decayedScore(a, now))
			.slice(0, MAX_ENTRIES),
	);
}

export function recordSends(
	sends: MediaSends,
	ids: readonly number[],
	now: number,
): MediaSends {
	const next = { ...sends };
	for (const id of new Set(ids)) {
		next[id] = { score: decayedScore(next[id], now) + 1, at: now };
	}
	return prune(next, now);
}

export function forgetSends(
	sends: MediaSends,
	ids: readonly number[],
): MediaSends {
	const next = { ...sends };
	for (const id of ids) delete next[id];
	return next;
}

/** Most sent first; ties, including never sent, keep their order. */
export function rankBySends<T extends { id: number }>(
	items: readonly T[],
	sends: MediaSends,
	now: number,
): T[] {
	return items
		.map((item) => ({ item, score: decayedScore(sends[item.id], now) }))
		.sort((a, b) => b.score - a.score)
		.map(({ item }) => item);
}

/**
 * Back in `serverOrder`, then ranked when sorting; items not in `previous` lead
 * so a fresh upload lands where it is expected.
 */
export function arrangeMedia<T extends { id: number }>(
	items: readonly T[],
	{
		serverOrder,
		previous,
		sends,
		now,
	}: {
		serverOrder: readonly number[];
		previous: readonly T[] | null;
		sends: MediaSends | null;
		now: number;
	},
): T[] {
	const position = new Map(serverOrder.map((id, i) => [id, i]));
	const base = items.toSorted(
		(a, b) => (position.get(a.id) ?? -1) - (position.get(b.id) ?? -1),
	);
	if (sends === null) return base;
	const ranked = rankBySends(base, sends, now);
	if (previous === null) return ranked;
	const known = new Set(previous.map((item) => item.id));
	return [
		...ranked.filter((item) => !known.has(item.id)),
		...ranked.filter((item) => known.has(item.id)),
	];
}
