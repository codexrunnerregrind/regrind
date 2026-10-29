import { tick } from "svelte";

export type ScrollableListState = {
	loading: boolean;
	/** Anything caught, unwrapped: a list keeps the error its API threw. */
	error: unknown;
	scrollY: number;
};

export function restoreScrollOnce({
	container,
	state,
	resolveTop,
}: {
	container: () => HTMLElement | null;
	state: ScrollableListState;
	resolveTop?: (restore: {
		scroller: HTMLElement;
		savedTop: number;
	}) => number;
}): void {
	let restored = false;
	$effect(() => {
		const el = container();
		if (restored || !el || state.loading || state.error !== null) return;
		restored = true;
		const savedTop = state.scrollY;
		let pending = true;
		let frame = 0;
		const apply = () => {
			if (!pending) return;
			pending = false;
			cancelAnimationFrame(frame);
			const top = resolveTop?.({ scroller: el, savedTop }) ?? savedTop;
			if (top > 0) el.scrollTop = top;
		};
		// A navigation can hold `tick` past the first paint of the remounted list,
		// which then shows its top for a frame. A frame callback runs before that
		// paint, once the list is in the document.
		const beforePaint = () => {
			if (el.isConnected && el.clientHeight > 0) apply();
			else frame = requestAnimationFrame(beforePaint);
		};
		frame = requestAnimationFrame(beforePaint);
		void tick().then(apply);
		return () => {
			if (pending) restored = false;
			pending = false;
			cancelAnimationFrame(frame);
		};
	});
}
