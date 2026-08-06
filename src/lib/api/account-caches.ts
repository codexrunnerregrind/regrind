const resets = new Set<() => void>();

let epoch = 0;

export function registerAccountCache({ reset }: { reset: () => void }): void {
	resets.add(reset);
}

/**
 * Wrap a per-account state constructor so one instance is shared and torn down
 * when the account changes. The returned getter also carries `peek`, which
 * answers with the existing instance or `null` — never constructing one, so a
 * passive reader (the notification service) cannot trigger a network load.
 */
export function accountScoped<T extends { destroy(): unknown }>(
	create: (profileId: number) => T,
): ((profileId: number) => T) & { peek: () => T | null } {
	let cached: T | null = null;
	let cachedProfileId: number | null = null;
	registerAccountCache({
		reset: () => {
			void cached?.destroy();
			cached = null;
			cachedProfileId = null;
		},
	});
	const get = (profileId: number): T => {
		if (cached !== null && cachedProfileId === profileId) return cached;
		void cached?.destroy();
		cached = create(profileId);
		cachedProfileId = profileId;
		return cached;
	};
	return Object.assign(get, { peek: (): T | null => cached });
}

export function accountEpoch(): number {
	return epoch;
}

export function isAccountEpochCurrent(captured: number): boolean {
	return captured === epoch;
}

export function clearAccountCaches(): void {
	epoch += 1;
	for (const reset of resets) {
		try {
			reset();
		} catch (error) {
			console.error("Account cache reset failed", error);
		}
	}
}
