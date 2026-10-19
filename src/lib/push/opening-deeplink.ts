const openedListeners = new Set<() => void>();
let openings = 0;

export function openingPushDeeplink(): boolean {
	return openings > 0;
}

// A tap that cold-started the app leaves its route for push.svelte.ts to take.
export function pushDeeplinkAhead(): Promise<boolean> {
	return Promise.resolve(
		openingPushDeeplink() ||
			(typeof window !== "undefined" && !!window.__REGRIND_PUSH_ROUTE),
	);
}

export function onPushDeeplinkOpened(listener: () => void): () => void {
	openedListeners.add(listener);
	return () => openedListeners.delete(listener);
}

export function untilPushDeeplinkOpened({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			stop();
			resolve();
		};
		const stop = onPushDeeplinkOpened(finish);
		const timer = setTimeout(finish, ms);
	});
}

export async function whileOpeningPushDeeplink(
	open: () => Promise<void>,
): Promise<void> {
	openings += 1;
	try {
		await open();
	} finally {
		openings -= 1;
		if (openings === 0) for (const listener of openedListeners) listener();
	}
}
