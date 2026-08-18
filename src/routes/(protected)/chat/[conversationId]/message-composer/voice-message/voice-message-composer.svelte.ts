import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import { uploadChatAudio } from "$lib/api/messaging/chat-media";
import { hapticImpact } from "$lib/platform/haptics";
import {
	MicrophoneDeniedError,
	recordingSupported,
	TooShortError,
	VoiceRecorder,
} from "$lib/platform/voice-recorder.svelte";
import type { MessageDraft } from "$lib/model/messaging/messages";

/**
 * Dragged this far towards the bin, releasing cancels rather than sends. A
 * third of the way is enough of a statement: nobody drags halfway across a
 * phone by accident, and having to is tiring.
 */
const CANCEL_AT = 1 / 3;

/**
 * A press shorter than this was a tap, not a hold, and locks the recorder so it
 * keeps running with the finger off the screen.
 */
const LOCK_TAP_MS = 500;

/** Used until the bin has been laid out, which it has not been at press time. */
const FALLBACK_TRAVEL_PX = 200;

/** Keeps a press near the left edge from arming on the first stray pixel. */
const MIN_TRAVEL_PX = 80;

/**
 * The composer's side of a voice message: hold the microphone open, then turn
 * what was said into a sent message. The recorder itself knows nothing about
 * conversations, and the components know nothing about uploads.
 */
export class VoiceMessageComposer {
	// A recording that runs to the limit is sent rather than lost: five minutes
	// of someone talking is the last thing to discard silently.
	#recorder = new VoiceRecorder({ onLimit: () => void this.send() });
	#sendMessages: (drafts: MessageDraft[]) => void | Promise<void>;

	constructor(
		sendMessages: (drafts: MessageDraft[]) => void | Promise<void>,
	) {
		this.#sendMessages = sendMessages;
	}

	get recording(): boolean {
		return this.#recorder.recording;
	}
	/** Set while the clip is on its way: the microphone is already shut by then. */
	sending = $state(false);
	/** The row swaps to the recording controls for both, so they travel together. */
	get active(): boolean {
		return this.#recorder.busy || this.sending;
	}
	get elapsedMs(): number {
		return this.#recorder.elapsedMs;
	}

	/**
	 * How far the finger has been dragged towards the bin, 0 to 1. Everything
	 * about the recording row reads from this, so the drag is visible from the
	 * first millimetre rather than only once some threshold trips.
	 */
	dragProgress = $state(0);
	/** The same drag in pixels, for the mic that travels under the finger. */
	dragPx = $state(0);
	/** Past the threshold, releasing throws the take away. */
	cancelArmed = $state(false);
	/** Recording hands-free after a tap: it now ends on a button, not a release. */
	locked = $state(false);

	#startX = 0;
	#pressedAt = 0;
	#travelPx: number | null = null;
	/** The finger that started the gesture; a second one must not steer it. */
	#pointerId: number | null = null;
	#cancelZone: HTMLElement | null = null;

	/** The bin registers itself, since only it knows where it ended up. */
	setCancelZone(element: HTMLElement | null): void {
		this.#cancelZone = element;
	}

	/** Where the finger went down, which is where the drag is measured from. */
	beginDrag(event: PointerEvent): void {
		this.#startX = event.clientX;
		this.#pressedAt = Date.now();
		this.#pointerId = event.pointerId;
		this.#travelPx = null;
		this.dragProgress = 0;
		this.dragPx = 0;
		this.cancelArmed = false;
	}

	/**
	 * Follows the finger. The bin is where the drag is headed, not a target that
	 * has to be hit: a third of the way is a clear enough intention, and a thumb
	 * cannot see what it is covering anyway.
	 */
	trackPointer(event: PointerEvent): void {
		if (!this.recording) return;
		// A second finger landing anywhere on the screen reports its own position,
		// and letting it through made the mic flick between two places at once.
		if (this.#pointerId !== null && event.pointerId !== this.#pointerId)
			return;
		const travel = this.#travel();
		const dragged = Math.min(
			travel,
			Math.max(0, this.#startX - event.clientX),
		);
		// Whole pixels only: a fingertip never holds still, and the fractions it
		// reports turn into a shimmer once they reach a transform.
		const rounded = Math.round(dragged);
		if (rounded !== this.dragPx) {
			this.dragPx = rounded;
			this.dragProgress = rounded / travel;
		}

		const armed = this.dragProgress >= CANCEL_AT;
		if (armed === this.cancelArmed) return;
		this.cancelArmed = armed;
		hapticImpact(armed ? "medium" : "light");
	}

	/**
	 * The distance from the finger's starting point to the bin, measured once
	 * and kept: neither end moves during a gesture, and asking the layout for it
	 * on every pointer frame is a hundred forced reflows a second.
	 */
	#travel(): number {
		if (this.#travelPx !== null) return this.#travelPx;
		const zone = this.#cancelZone;
		// The bin is only laid out once recording has begun, so the first frames
		// of a fast drag may land before there is anything to measure.
		if (zone === null) return FALLBACK_TRAVEL_PX;
		const { left, right } = zone.getBoundingClientRect();
		this.#travelPx = Math.max(
			MIN_TRAVEL_PX,
			this.#startX - (left + right) / 2,
		);
		return this.#travelPx;
	}

	/** Called when the composer goes away with a recording still in progress. */
	abandon(): void {
		if (!this.#recorder.busy) return;
		this.#recorder.discard();
		this.locked = false;
		this.#resetDrag();
	}

	async start(): Promise<void> {
		if (!recordingSupported()) {
			toast.error("This device cannot record audio");
			return;
		}
		try {
			await this.#recorder.start();
			hapticImpact("medium");
		} catch (error) {
			if (error instanceof MicrophoneDeniedError) {
				toast.error(
					"Microphone access is off — turn it on in Settings to record",
				);
				return;
			}
			console.error(error);
			showErrorToast({ label: "Couldn't start recording", error });
		}
	}

	discard(): void {
		this.#recorder.discard();
		this.locked = false;
		this.#resetDrag();
		hapticImpact("light");
	}

	#resetDrag(): void {
		this.#pointerId = null;
		this.#travelPx = null;
		this.cancelArmed = false;
		this.dragProgress = 0;
		this.dragPx = 0;
	}

	/**
	 * The finger came up. Past the cancel threshold the take is thrown away; off
	 * the back of a tap rather than a hold the recorder locks and keeps running,
	 * so a voice note does not have to be held for its whole length; otherwise
	 * this was a hold, and letting go sends it.
	 */
	async release(): Promise<void> {
		if (!this.recording || this.locked) return;
		if (this.cancelArmed) {
			this.discard();
			return;
		}
		if (Date.now() - this.#pressedAt < LOCK_TAP_MS) {
			this.locked = true;
			this.#resetDrag();
			hapticImpact("light");
			return;
		}
		await this.send();
	}

	async send(): Promise<void> {
		if (!this.recording) return;
		this.locked = false;
		this.#resetDrag();
		let clip;
		try {
			clip = await this.#recorder.finish();
		} catch (error) {
			// A tap that never became a recording is not worth an error: the take is
			// already gone, so say what happened and leave the composer as it was.
			if (error instanceof TooShortError) {
				toast("Hold on a moment longer to record");
				return;
			}
			console.error(error);
			showErrorToast({ label: "Recording failed", error });
			return;
		}

		this.sending = true;
		try {
			const uploaded = await uploadChatAudio(clip);
			await this.#sendMessages([
				{
					outbound: {
						type: "Audio",
						body: { mediaId: uploaded.mediaId },
					},
					// Enough of a body for the bubble to play the clip back straight
					// away, from the URL the upload just handed us.
					optimistic: {
						type: "Audio",
						body: {
							mediaId: uploaded.mediaId,
							mediaHash: uploaded.mediaHash,
							url: uploaded.url,
							contentType: clip.contentType,
							length: clip.durationMs,
							expiresAt: null,
						},
					},
				},
			]);
			hapticImpact("light");
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to send voice message", error });
		} finally {
			this.sending = false;
		}
	}
}
