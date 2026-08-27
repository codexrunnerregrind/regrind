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

	start(): void {
		this.cancel();
		// A claim the click never came to collect must not outlive this press.
		this.#held = false;
		if (!this.#enabled()) return;
		this.#timer = setTimeout(() => {
			this.#armed = true;
			this.holding = true;
			hapticImpact("medium");
		}, HOLD_MS);
	}

	end(): void {
		clearTimeout(this.#timer);
		this.holding = false;
		if (!this.#armed) return;
		this.#armed = false;
		this.#held = true;
		this.#run();
	}

	cancel(): void {
		clearTimeout(this.#timer);
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
