import {
	paneFrame,
	stackMotion,
} from "#lib/components/navigation/stack/motion.ts";
import {
	type PaneSnapshot,
	snapshotPane,
	trackScrolled,
} from "#lib/components/navigation/stack/snapshot.ts";
import { getLocale } from "#lib/i18n/index.ts";

// SvelteKit numbers its history entries under this key (HISTORY_INDEX).
const HISTORY_INDEX = "sveltekit:history";
// Only a back swipe reads these, and it only ever wants the entry just behind.
const KEPT = 3;

// The locale is kept so a copy taken before a language change is never shown.
const snapshots = new Map<number, { snapshot: PaneSnapshot; locale: string }>();

export type GhostFixup = (ghost: HTMLElement) => void;
const fixups = new Map<string, GhostFixup>();

/** Adjusts copies of `path` before they are shown, e.g. to scroll them. */
export function registerGhostFixup(path: string, fixup: GhostFixup): void {
	fixups.set(path, fixup);
}

/** Drops every copy of `path`, for when what it shows has changed. */
export function forgetScreens(path: string): void {
	for (const [index, kept] of [...snapshots])
		if (kept.snapshot.path === path) snapshots.delete(index);
}

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
	snapshots.set(index, { snapshot, locale: getLocale() });
	for (const kept of [...snapshots.keys()].sort((a, b) => b - a).slice(KEPT))
		snapshots.delete(kept);
}

export type SwipeBackGhost = {
	/** 0 with the page resting over it, 1 with the page swiped away. */
	track(progress: number): void;
	/** Eases to `progress` over `transition`, a CSS duration and easing. */
	settle(progress: number, transition: string): void;
	/**
	 * Lifts the copy over the page, which can then land beneath it unseen. It
	 * takes taps meanwhile, which would land on a page not yet as pictured.
	 */
	raise(): void;
	remove(): void;
};

/** Shows the screen a back swipe would land on beneath `screen`, if kept. */
export function showSwipeBackGhost(screen: HTMLElement): SwipeBackGhost | null {
	const index = historyIndex();
	const kept = index === null ? undefined : snapshots.get(index - 1);
	if (!kept || kept.locale !== getLocale()) return null;
	const { snapshot } = kept;

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
	fixups.get(snapshot.path)?.(snapshot.node);

	const motion = stackMotion();
	const apply = (progress: number) => {
		const frame = paneFrame({ progress, parallax: true, motion });
		host.style.transform = frame.back.transform;
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
		raise: () => {
			host.style.zIndex = "2147483647";
			host.style.pointerEvents = "auto";
		},
		remove: () => host.remove(),
	};
}
