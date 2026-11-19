import type { GridProfile } from "./grid";

/**
 * Sort keys in meters. A profile without a distance takes the last one shown
 * before it in Grindr's order, which places it by real distance; a shuffled
 * cascade or an injected boost carries no such order, so those sink.
 */
function distanceKeys({
	profiles,
	outOfOrder,
	shuffled,
}: {
	profiles: readonly GridProfile[];
	outOfOrder: ReadonlySet<number>;
	shuffled: boolean;
}): Map<number, number> {
	const keys = new Map<number, number>();
	let anchor = 0;
	for (const profile of profiles) {
		const distance = profile.type === "rendered" ? profile.distance : null;
		const injected = outOfOrder.has(profile.id);
		if (distance !== null) {
			keys.set(profile.id, distance);
			if (!injected) anchor = distance;
		} else {
			keys.set(profile.id, shuffled || injected ? Infinity : anchor);
		}
	}
	return keys;
}

/**
 * Nearest first, except the `seen` prefix, which keeps its order so tiles
 * never move under the user. `closer` counts profiles sorted below it that
 * belong above.
 */
export function sortByDistance({
	profiles,
	seen,
	outOfOrder,
	shuffled,
}: {
	profiles: readonly GridProfile[];
	seen: readonly number[];
	outOfOrder: ReadonlySet<number>;
	shuffled: boolean;
}): { profiles: GridProfile[]; closer: number } {
	const keys = distanceKeys({ profiles, outOfOrder, shuffled });
	const key = (profile: GridProfile) => keys.get(profile.id) ?? Infinity;
	const byId = new Map(profiles.map((profile) => [profile.id, profile]));
	const head = seen.flatMap((id) => byId.get(id) ?? []);
	const headIds = new Set(head.map((profile) => profile.id));
	const tail = profiles
		.filter((profile) => !headIds.has(profile.id))
		.toSorted((a, b) => {
			const ka = key(a);
			const kb = key(b);
			return ka < kb ? -1 : ka > kb ? 1 : 0;
		});
	const limit = Math.max(
		-Infinity,
		...head.map(key).filter((value) => Number.isFinite(value)),
	);
	return {
		profiles: [...head, ...tail],
		closer: tail.filter((profile) => key(profile) < limit).length,
	};
}
