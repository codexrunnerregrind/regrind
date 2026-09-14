import { hapticImpact } from "$lib/platform/haptics";

const HOLD_MS = 500;

/**
 * Tap-or-hold on one control: the tap stays its `onclick`, holding runs `run`.
 *
 * `run` fires on release, not when the timer does — iOS only opens a share
 * sheet for a real tap (see `shareOrAskForATap`), so the timer just arms and
 * buzzes. The release also fires a click; {@link claimedClick} swallows it.
 */
export class HoldGesture {
	#run: () => void;
	#enabled: () => boolean;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#armed = false;
	#held = false;
	holding = $state(false);

	/** `enabled` is asked per press, so a control can lose its hold action. */
	constructor({ run, enabled }: { run: () => void; enabled: () => boolean }) {
		this.#run = run;
		this.#enabled = enabled;
	}

	/**
	 * The platform's own long-press, which on Android arrives as a `contextmenu`
	 * that also ends the touch: the `pointerup` behind it lands before our timer
	 * would have armed, so without this a hold never fires there.
	 */
	press(): void {
		if (this.#armed || this.#timer === undefined) return;
		clearTimeout(this.#timer);
		this.#arm();
	}

	start(): void {
		this.cancel();
		// A claim the click never came to collect must not outlive this press.
		this.#held = false;
		if (!this.#enabled()) return;
		this.#timer = setTimeout(() => this.#arm(), HOLD_MS);
	}

	#arm(): void {
		this.#timer = undefined;
		this.#armed = true;
		this.holding = true;
		hapticImpact("medium");
	}

	end(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		this.holding = false;
		if (!this.#armed) return;
		this.#armed = false;
		this.#held = true;
		this.#run();
	}

	cancel(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		this.#armed = false;
		this.holding = false;
	}

	/** Whether this click belongs to a hold that already acted. Clears the claim. */
	claimedClick(): boolean {
		if (!this.#held) return false;
		this.#held = false;
		return true;
	}

	dispose(): void {
		clearTimeout(this.#timer);
	}
}
