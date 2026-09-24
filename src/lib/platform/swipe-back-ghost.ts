import { paneFrame } from "$lib/components/navigation/stack/motion";
import {
	type PaneSnapshot,
	snapshotPane,
	trackScrolled,
} from "$lib/components/navigation/stack/snapshot";

// SvelteKit numbers its history entries under this key (HISTORY_INDEX).
const HISTORY_INDEX = "sveltekit:history";
// Only a back swipe reads these, and it only ever wants the entry just behind.
const KEPT = 3;

const snapshots = new Map<number, PaneSnapshot>();

function historyIndex(): number | null {
	const state: unknown = history.state;
	if (typeof state !== "object" || state === null) return null;
	const index = (state as Record<string, unknown>)[HISTORY_INDEX];
	return typeof index === "number" ? index : null;
}

/** Tracks the screen's scrolled elements so a snapshot keeps their offsets. */
export function trackScreenScroll(screen: HTMLElement): () => void {
	return trackScrolled(screen) ?? (() => {});
}

/**
 * Keeps a copy of the screen being left, for a later back swipe to show
 * beneath the page. Called before every navigation.
 */
export function rememberScreen(screen: HTMLElement): void {
	const index = historyIndex();
	if (index === null) return;
	const snapshot = snapshotPane(screen, location.pathname);
	// The clone carries the live screen's inline styles, a drag's among them.
	snapshot.node.style.cssText = "";
	snapshots.set(index, snapshot);
	for (const kept of [...snapshots.keys()].sort((a, b) => b - a).slice(KEPT))
		snapshots.delete(kept);
}

export type SwipeBackGhost = {
	/** 0 with the page resting over it, 1 with the page swiped away. */
	track(progress: number): void;
	/** Eases to `progress` over `transition`, a CSS duration and easing. */
	settle(progress: number, transition: string): void;
	remove(): void;
};

/** Shows the screen a back swipe would land on beneath `screen`, if kept. */
export function showSwipeBackGhost(screen: HTMLElement): SwipeBackGhost | null {
	const index = historyIndex();
	const snapshot = index === null ? undefined : snapshots.get(index - 1);
	if (!snapshot) return null;

	const host = document.createElement("div");
	host.setAttribute("aria-hidden", "true");
	host.dataset.slot = "swipe-back-ghost";
	// A transformed host is the containing block for the copy's fixed bars, so
	// they sit where they did on screen and slide with it.
	host.style.cssText =
		"position:fixed;inset:0;overflow:hidden;pointer-events:none;background:var(--background)";
	const dim = document.createElement("div");
	dim.style.cssText =
		"position:absolute;inset:0;z-index:2147483647;background:#000;opacity:0";
	host.append(snapshot.node, dim);
	screen.before(host);
	snapshot.restore();

	const apply = (progress: number) => {
		const frame = paneFrame({ progress, parallax: true });
		host.style.transform = frame.back;
		dim.style.opacity = String(frame.dim);
	};
	apply(0);

	return {
		track: (progress) => {
			host.style.transition = "none";
			dim.style.transition = "none";
			apply(progress);
		},
		settle: (progress, transition) => {
			host.style.transition = `transform ${transition}`;
			dim.style.transition = `opacity ${transition}`;
			apply(progress);
		},
		remove: () => host.remove(),
	};
}
