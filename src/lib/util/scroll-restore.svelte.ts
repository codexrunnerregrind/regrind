import { tick } from "svelte";

export type ScrollableListState = {
	loading: boolean;
	/** Anything caught, unwrapped: a list keeps the error its API threw. */
	error: unknown;
	scrollY: number;
};

export function restoreScrollOnce(
	container: () => HTMLElement | null,
	state: ScrollableListState,
): void {
	let restored = false;
	$effect(() => {
		const el = container();
		if (restored || !el || state.loading || state.error !== null) return;
		restored = true;
		const top = state.scrollY;
		if (top > 0) void tick().then(() => (el.scrollTop = top));
	});
}
