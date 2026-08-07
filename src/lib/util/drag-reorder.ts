import { hapticImpact, hapticSelection } from "$lib/platform/haptics";

/**
 * Long-press-and-drag reordering for a grid of tiles.
 *
 * Per-tile arrow buttons were the obvious way to do this and the wrong one:
 * they cover the photo you are trying to judge, and moving an item three places
 * costs three taps. Here the tile itself is the handle — hold it, it lifts, and
 * it lands wherever you let go.
 *
 * Pointer events rather than HTML5 drag-and-drop, which does not exist on
 * touch. The lifted tile follows the finger while the rest of the grid stays
 * put; the cell it would land in is marked instead, so nothing reflows under
 * the finger and the drop target stays predictable.
 *
 * Items are the descendants carrying `data-reorder-item`, and their index is
 * their position among those, so the action needs nothing from the caller but
 * the move itself.
 */
export type DragReorderOptions = {
	/** Called once, on drop, with the item's old and new positions. */
	onReorder: (from: number, to: number) => void;
	/** Set false while a move is in flight, or the grid is not yours. */
	enabled?: boolean;
};

// How long the tile has to be held before it lifts, and how far the finger may
// stray in that time before this is treated as a scroll instead.
const HOLD_MS = 260;
const SLOP = 8;

export function dragReorder(node: HTMLElement, options: DragReorderOptions) {
	let opts = options;

	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let pending: { el: HTMLElement; x: number; y: number; id: number } | null =
		null;
	let drag: {
		el: HTMLElement;
		id: number;
		from: number;
		to: number;
		x: number;
		y: number;
		rects: DOMRect[];
	} | null = null;
	let pointerListenersBound = false;

	function items(): HTMLElement[] {
		return [...node.querySelectorAll<HTMLElement>("[data-reorder-item]")];
	}

	function markTarget(index: number | null) {
		for (const [i, el] of items().entries()) {
			el.toggleAttribute("data-reorder-target", i === index);
		}
	}

	function cancelPending() {
		if (holdTimer !== null) clearTimeout(holdTimer);
		holdTimer = null;
		pending = null;
		releasePointerListeners();
	}

	function lift() {
		if (pending === null) return;
		const all = items();
		const from = all.indexOf(pending.el);
		if (from === -1) return cancelPending();

		drag = {
			el: pending.el,
			id: pending.id,
			from,
			to: from,
			x: pending.x,
			y: pending.y,
			rects: all.map((el) => el.getBoundingClientRect()),
		};
		cancelPending();
		bindTouchMove();

		hapticImpact("medium");
		drag.el.setAttribute("data-reorder-dragging", "");
		// Captured so the drag survives the finger leaving the tile — without it
		// the pointer events stop as soon as you cross into a neighbour.
		drag.el.setPointerCapture(drag.id);
	}

	function drop() {
		if (drag === null) return;
		const { el, from, to } = drag;
		el.removeAttribute("data-reorder-dragging");
		el.style.transform = "";
		markTarget(null);
		drag = null;
		unbindTouchMove();
		releasePointerListeners();
		// The pointerup that ends a drag would otherwise click straight through to
		// the tile underneath and open the photo you just finished moving.
		if (to !== from) {
			window.addEventListener("click", swallowClick, {
				capture: true,
				once: true,
			});
			opts.onReorder(from, to);
		}
	}

	function swallowClick(event: Event) {
		event.stopPropagation();
		event.preventDefault();
	}

	// A held finger has not started a scroll yet, so preventing the first
	// touchmove keeps the scroller from claiming the gesture mid-drag. This has
	// to be a non-passive listener, and it cannot be `touch-action: none` on the
	// tiles: that would cost the ability to scroll the grid by dragging a photo,
	// which is how you reach the rest of the album.
	//
	// It is bound only for the length of a lift. A non-passive touchmove on the
	// document takes every scroll off WebKit's fast path — it has to wait on JS
	// before it may move — so leaving one bound for the life of the screen makes
	// the whole album scroll janky to buy a preventDefault that matters for the
	// half-second a tile is actually in the air.
	function onTouchMove(event: TouchEvent) {
		if (drag !== null) event.preventDefault();
	}

	function bindTouchMove() {
		document.addEventListener("touchmove", onTouchMove, { passive: false });
	}

	function unbindTouchMove() {
		document.removeEventListener("touchmove", onTouchMove);
	}

	// The move/up/cancel listeners are global — they have to be, since a lifted
	// tile follows the finger past the grid's edges — but they only have work to
	// do between a press on a tile and its release, so they are bound for exactly
	// that long rather than for the life of the screen.
	function claimPointerListeners() {
		if (pointerListenersBound) return;
		pointerListenersBound = true;
		window.addEventListener("pointermove", onPointerMove, { passive: false });
		window.addEventListener("pointerup", onPointerUp);
		// A cancelled pointer still drops the tile where it was last dragged to:
		// the move was deliberate, and losing it because the WebView reclaimed the
		// gesture would look like the drag simply did not work.
		window.addEventListener("pointercancel", onPointerUp);
	}

	function releasePointerListeners() {
		// Called from cancelPending() during a lift, where the press has become a
		// drag and the listeners are still needed.
		if (!pointerListenersBound || pending !== null || drag !== null) return;
		pointerListenersBound = false;
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", onPointerUp);
		window.removeEventListener("pointercancel", onPointerUp);
	}

	function onPointerDown(event: PointerEvent) {
		if (opts.enabled === false || drag !== null || event.button !== 0) return;
		const el = (event.target as HTMLElement | null)?.closest<HTMLElement>(
			"[data-reorder-item]",
		);
		if (el === null || el === undefined || !node.contains(el)) return;

		pending = { el, x: event.clientX, y: event.clientY, id: event.pointerId };
		claimPointerListeners();
		holdTimer = setTimeout(lift, HOLD_MS);
	}

	function onPointerMove(event: PointerEvent) {
		if (pending !== null && event.pointerId === pending.id) {
			// Still deciding whether this is a drag or a scroll.
			const moved =
				Math.abs(event.clientX - pending.x) > SLOP ||
				Math.abs(event.clientY - pending.y) > SLOP;
			if (moved) cancelPending();
			return;
		}
		if (drag === null || event.pointerId !== drag.id) return;

		event.preventDefault();
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		drag.el.style.transform = `translate(${dx}px, ${dy}px)`;

		const over = drag.rects.findIndex(
			(rect) =>
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom,
		);
		const to = over === -1 ? drag.to : over;
		if (to !== drag.to) {
			drag.to = to;
			hapticSelection();
			markTarget(to === drag.from ? null : to);
		}
	}

	function onPointerUp(event: PointerEvent) {
		if (pending !== null && event.pointerId === pending.id)
			return cancelPending();
		if (drag !== null && event.pointerId === drag.id) drop();
	}

	node.addEventListener("pointerdown", onPointerDown);

	return {
		update(next: DragReorderOptions) {
			opts = next;
			if (next.enabled === false) {
				cancelPending();
				drop();
			}
		},
		destroy() {
			cancelPending();
			drop();
			node.removeEventListener("pointerdown", onPointerDown);
			// cancelPending() and drop() have cleared both, so this releases.
			releasePointerListeners();
			unbindTouchMove();
		},
	};
}
