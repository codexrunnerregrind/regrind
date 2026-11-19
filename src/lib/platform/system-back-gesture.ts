import {
	backGestureEventHandlers,
	topBackGestureHandler,
} from "#lib/platform/back-gesture-event.svelte.ts";

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

/** The stack's native swipe (iOS) takes this one; the JS swipe stands aside. */
export const NATIVE_SWIPE = "native";

type EdgeSwipeClaim = EdgeSwipe | typeof NATIVE_SWIPE | null;

let edgeSwipeOwner: (() => EdgeSwipeClaim) | null = null;

/** Whether a dialog, sheet or other overlay would take the next back gesture. */
export function backGestureOverlayOpen(): boolean {
	// A stack stays registered while mounted, so it says nothing either way.
	return [...backGestureEventHandlers.values()].some(
		(layer) => layer !== "stack",
	);
}

/** Hands a touch edge swipe (iOS) to the attached stack, if it can go back. */
export function beginEdgeSwipeBack(): EdgeSwipeClaim {
	return edgeSwipeOwner?.() ?? null;
}

/** Makes `begin` the taker of the next edge swipe, until the returned undo. */
export function ownEdgeSwipe(begin: () => EdgeSwipeClaim): () => void {
	edgeSwipeOwner = begin;
	return () => {
		if (edgeSwipeOwner === begin) edgeSwipeOwner = null;
	};
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

	const ownsTheGesture = () => topBackGestureHandler() === commitInFlight;

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
	backGestureEventHandlers.set(commitInFlight, "stack");

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
