import { createAttachmentKey } from "svelte/attachments";
import { Spring } from "svelte/motion";

import { hapticImpact } from "$lib/platform/haptics";

const TRIGGER_DISTANCE_PX = 44;
const MAX_DRAG_PX = 76;
/**
 * How far a finger has to travel before the swipe is either claimed or handed
 * to the list. It is deliberately tiny: iOS decides whether a touch is a scroll
 * on the first move it is allowed to keep, and once it has started scrolling
 * the gesture is gone — later `preventDefault` calls are ignored and the
 * pointer is canceled. So the call has to be made while there is barely any
 * movement to judge.
 */
const DECIDE_PX = 4;

type Phase = "idle" | "watching" | "dragging" | "declined";

export class SwipeToReply {
	readonly #offset = new Spring(0, { stiffness: 0.4, damping: 0.75 });
	armed = $state(false);

	readonly #dragSign: 1 | -1;
	readonly #onReply: () => void;
	#phase: Phase = "idle";
	#startX = 0;
	#startY = 0;

	constructor(direction: "left" | "right", onReply: () => void) {
		this.#dragSign = direction === "right" ? 1 : -1;
		this.#onReply = onReply;
	}

	/**
	 * Spread onto the row. Touch is handled directly rather than through a
	 * gesture helper because the swipe has to be able to `preventDefault` the
	 * move that claims it, which needs a non-passive listener.
	 */
	readonly handlers = {
		[createAttachmentKey()]: (node: Element) => {
			const el = node as HTMLElement;
			// Vertical panning stays the browser's; sideways is ours to claim.
			el.style.touchAction = "pan-y";

			const onTouchStart = (event: TouchEvent) => {
				const touch = event.touches[0];
				if (event.touches.length !== 1 || !touch) {
					this.#phase = "declined";
					return;
				}
				this.#phase = "watching";
				this.#startX = touch.clientX;
				this.#startY = touch.clientY;
			};

			const onTouchMove = (event: TouchEvent) => {
				const touch = event.touches[0];
				if (!touch) return;
				if (this.#track(touch.clientX, touch.clientY)) {
					// Holding on to the gesture: without this the list scrolls
					// away underneath and the swipe never gets to finish.
					if (event.cancelable) event.preventDefault();
				}
			};

			const onTouchEnd = () => this.#settle();
			const onTouchCancel = () => this.cancel();

			// Mouse has no scroll to compete with, so it just follows the pointer.
			const onPointerDown = (event: PointerEvent) => {
				if (event.pointerType !== "mouse") return;
				this.#phase = "watching";
				this.#startX = event.clientX;
				this.#startY = event.clientY;
			};
			const onPointerMove = (event: PointerEvent) => {
				if (event.pointerType !== "mouse") return;
				this.#track(event.clientX, event.clientY);
			};
			const onPointerUp = (event: PointerEvent) => {
				if (event.pointerType !== "mouse") return;
				this.#settle();
			};

			el.addEventListener("touchstart", onTouchStart, { passive: true });
			el.addEventListener("touchmove", onTouchMove, { passive: false });
			el.addEventListener("touchend", onTouchEnd, { passive: true });
			el.addEventListener("touchcancel", onTouchCancel, {
				passive: true,
			});
			el.addEventListener("pointerdown", onPointerDown);
			el.addEventListener("pointermove", onPointerMove);
			el.addEventListener("pointerup", onPointerUp);
			el.addEventListener("pointerleave", onPointerUp);
			return () => {
				el.removeEventListener("touchstart", onTouchStart);
				el.removeEventListener("touchmove", onTouchMove);
				el.removeEventListener("touchend", onTouchEnd);
				el.removeEventListener("touchcancel", onTouchCancel);
				el.removeEventListener("pointerdown", onPointerDown);
				el.removeEventListener("pointermove", onPointerMove);
				el.removeEventListener("pointerup", onPointerUp);
				el.removeEventListener("pointerleave", onPointerUp);
			};
		},
	};

	/** Feeds a move in; answers whether the swipe now owns the gesture. */
	#track(clientX: number, clientY: number): boolean {
		if (this.#phase === "idle" || this.#phase === "declined") return false;
		const alongX = (clientX - this.#startX) * this.#dragSign;
		const acrossY = Math.abs(clientY - this.#startY);
		if (this.#phase === "watching") {
			if (Math.max(Math.abs(clientX - this.#startX), acrossY) < DECIDE_PX)
				return false;
			// Sideways, the right way, and more sideways than down: anything else
			// is the list being scrolled and stays the list's for this touch.
			if (alongX <= acrossY) {
				this.#phase = "declined";
				return false;
			}
			this.#phase = "dragging";
		}
		const magnitude = Math.min(Math.max(alongX, 0), MAX_DRAG_PX);
		void this.#offset.set(magnitude * this.#dragSign, { instant: true });
		const armed = magnitude > TRIGGER_DISTANCE_PX;
		// A tap the moment the swipe passes the point of no return, so the reply
		// can be committed by feel without watching the arrow fill in.
		if (armed !== this.armed) hapticImpact(armed ? "medium" : "light");
		this.armed = armed;
		return true;
	}

	#settle(): void {
		if (this.#phase === "dragging" && this.armed) this.#onReply();
		this.cancel();
	}

	/**
	 * Also called on a canceled pointer: something else took the gesture over,
	 * and without this the bubble would stay parked where the finger left it.
	 */
	cancel(): void {
		this.#phase = "idle";
		this.armed = false;
		void this.#offset.set(0);
	}

	get deltaX(): number {
		return this.#offset.current;
	}

	get progress(): number {
		return Math.min(
			Math.abs(this.#offset.current) / TRIGGER_DISTANCE_PX,
			1,
		);
	}
}
