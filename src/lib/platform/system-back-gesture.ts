import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";

export type SwipeBackStack = {
	readonly tracking: boolean;
	beginSwipeBack(): boolean;
	trackSwipeBack(progress: number): void;
	commitSwipeBack(): void;
	cancelSwipeBack(): void;
};

/** An edge swipe a stack took over; progress runs 0 (resting) to 1 (gone). */
export type EdgeSwipe = {
	track(progress: number): void;
	commit(): void;
	cancel(): void;
};

let edgeSwipeOwner: (() => EdgeSwipe | null) | null = null;

/** Hands a touch edge swipe (iOS) to the attached stack, if it can go back. */
export function beginEdgeSwipeBack(): EdgeSwipe | null {
	return edgeSwipeOwner?.() ?? null;
}

export function attachSystemBackGesture(stack: SwipeBackStack): () => void {
	let frame: number | undefined;

	const stopReading = () => {
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = undefined;
	};

	const readProgress = () => {
		if (!stack.tracking) {
			stopReading();
			return;
		}
		const progress = window.__AndroidBack?.gestureProgress();
		if (progress !== undefined) stack.trackSwipeBack(progress);
		frame = requestAnimationFrame(readProgress);
	};

	const commitInFlight = () => {
		if (!stack.tracking) return true;
		stopReading();
		stack.commitSwipeBack();
		return false;
	};

	const ownsTheGesture = () =>
		[...backGestureEventHandlers].at(-1) === commitInFlight;

	const start = () => {
		if (!ownsTheGesture() || !stack.beginSwipeBack()) return false;
		frame = requestAnimationFrame(readProgress);
		return true;
	};
	const cancel = () => {
		stopReading();
		stack.cancelSwipeBack();
	};
	const beginEdge = (): EdgeSwipe | null => {
		if (!ownsTheGesture() || !stack.beginSwipeBack()) return null;
		return {
			track: (progress) => stack.trackSwipeBack(progress),
			commit: () => void commitInFlight(),
			cancel: () => stack.cancelSwipeBack(),
		};
	};
	window.__AndroidOnBackGestureStart = start;
	window.__AndroidOnBackGestureCancel = cancel;
	edgeSwipeOwner = beginEdge;
	backGestureEventHandlers.add(commitInFlight);

	return () => {
		stopReading();
		backGestureEventHandlers.delete(commitInFlight);
		if (edgeSwipeOwner === beginEdge) edgeSwipeOwner = null;
		if (window.__AndroidOnBackGestureStart === start)
			delete window.__AndroidOnBackGestureStart;
		if (window.__AndroidOnBackGestureCancel === cancel)
			delete window.__AndroidOnBackGestureCancel;
	};
}
