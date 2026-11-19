// iOS withholds a tap's click when clickable content appears while it plays the
// tap's hover events, taking the tap to have opened a menu. Work that adds rows
// on its own schedule waits while a tap may be in flight.

// Past this the finger is scrolling, and no click will follow.
export const TAP_SLOP_PX = 10;
// From the lift to the click, with room for WebKit's hover events.
export const TAP_CLICK_WINDOW_MS = 350;

export class TapQuiet {
	#start: { x: number; y: number } | null = null;
	#quietUntil = Number.NEGATIVE_INFINITY;

	touchStart({ x, y, touches }: { x: number; y: number; touches: number }) {
		this.#start = touches === 1 ? { x, y } : null;
	}

	touchMove({ x, y }: { x: number; y: number }) {
		if (!this.#start) return;
		if (Math.hypot(x - this.#start.x, y - this.#start.y) > TAP_SLOP_PX)
			this.#start = null;
	}

	touchEnd({ at }: { at: number }) {
		if (this.#start) this.#quietUntil = at + TAP_CLICK_WINDOW_MS;
		this.#start = null;
	}

	touchCancel() {
		this.#start = null;
	}

	pending(now: number): boolean {
		return this.#start !== null || now < this.#quietUntil;
	}
}

let shared: TapQuiet | null = null;

function install(): TapQuiet {
	const quiet = new TapQuiet();
	const options = { capture: true, passive: true } as const;
	addEventListener(
		"touchstart",
		(event) => {
			const touch = event.touches[0];
			if (!touch) return;
			quiet.touchStart({
				x: touch.clientX,
				y: touch.clientY,
				touches: event.touches.length,
			});
		},
		options,
	);
	addEventListener(
		"touchmove",
		(event) => {
			const touch = event.touches[0];
			if (touch) quiet.touchMove({ x: touch.clientX, y: touch.clientY });
		},
		options,
	);
	addEventListener(
		"touchend",
		() => quiet.touchEnd({ at: performance.now() }),
		options,
	);
	addEventListener("touchcancel", () => quiet.touchCancel(), options);
	return quiet;
}

/** Whether a tap may be on its way to a click. */
export function tapPending(): boolean {
	if (typeof window === "undefined") return false;
	shared ??= install();
	return shared.pending(performance.now());
}
