import { revealRowScrollTop } from "#lib/util/grid-window.ts";
import { readGridMetrics } from "#lib/util/virtual-grid.svelte.ts";

type CellSlot = { grid: HTMLElement; index: number };

// The cascade's first rows get a fully rendered grid of their own ahead of the
// For you band; the rest follow in the virtualized one.
function cellSlot(scroller: HTMLElement, index: number): CellSlot | null {
	const grids = [
		...scroller.querySelectorAll<HTMLElement>('[data-slot="grid-cells"]'),
	];
	const last = grids.at(-1);
	if (index < 0 || !last) return null;
	if (grids.length === 1) return { grid: last, index };
	const lead = grids[0]!.children.length;
	return index < lead
		? { grid: grids[0]!, index }
		: { grid: last, index: index - lead };
}

/** Where to scroll the grid so the cell at `index` is in view, or `savedTop`. */
export function revealedGridScrollTop({
	scroller,
	savedTop,
	index,
}: {
	scroller: HTMLElement;
	savedTop: number;
	index: number;
}): number {
	const content = scroller.querySelector('[data-slot="grid-content"]');
	const slot = cellSlot(scroller, index);
	if (!content || !slot) return savedTop;

	const { columns, cellPx, gapPx } = readGridMetrics(slot.grid);
	if (cellPx <= 0 || columns <= 0) return savedTop;

	const gridTopPx =
		slot.grid.getBoundingClientRect().top -
		scroller.getBoundingClientRect().top +
		scroller.scrollTop;
	const insets = getComputedStyle(content);
	return revealRowScrollTop({
		savedTop,
		rowTopPx:
			gridTopPx + Math.floor(slot.index / columns) * (cellPx + gapPx),
		rowHeightPx: cellPx,
		viewportPx: scroller.clientHeight,
		insetTopPx: Number.parseFloat(insets.paddingTop) || 0,
		insetBottomPx: Number.parseFloat(insets.paddingBottom) || 0,
		maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
	});
}

/** Scrolls a snapshot of the grid to the profile, when its cell was captured. */
export function revealInGhostGrid({
	ghost,
	profileId,
	index,
}: {
	ghost: HTMLElement;
	profileId: number;
	index: number;
}): void {
	const scroller = ghost.querySelector<HTMLElement>(
		'[data-slot="grid-scroller"]',
	);
	const cell = scroller?.querySelector(
		`[data-slot="grid-cells"] a[href="/profile/${profileId}"]`,
	);
	if (!scroller || !cell) return;
	scroller.scrollTop = revealedGridScrollTop({
		scroller,
		savedTop: scroller.scrollTop,
		index,
	});
}
