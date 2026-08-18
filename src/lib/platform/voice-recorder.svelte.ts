/**
 * Recording a voice note: microphone in, one clip out.
 *
 * The webview does the capture itself — `MediaRecorder` is available on every
 * platform the app ships to — so nothing native is involved beyond the
 * permission the OS asks for the first time.
 */

// AAC in MP4 is what the API's own clips are, so it leads; the others are here
// because WebKit and Chromium disagree about what they will record.
const PREFERRED_TYPES = [
	"audio/mp4",
	"audio/aac",
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/ogg;codecs=opus",
];

// Long enough for anything anyone means to say, short enough that a recording
// left running by accident does not become a 40MB upload.
export const MAX_DURATION_MS = 5 * 60 * 1000;

// Under this it is a mis-tap rather than a message.
export const MIN_DURATION_MS = 400;

export type VoiceClip = {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
	durationMs: number;
};

export class MicrophoneDeniedError extends Error {
	constructor() {
		super("Microphone access was refused");
		this.name = "MicrophoneDeniedError";
	}
}

export class TooShortError extends Error {
	constructor() {
		super("Recording was too short to send");
		this.name = "TooShortError";
	}
}

export class NotRecordingError extends Error {
	constructor() {
		super("There is no recording to finish");
		this.name = "NotRecordingError";
	}
}

function pickMimeType(): string | undefined {
	if (typeof MediaRecorder === "undefined") return undefined;
	return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function recordingSupported(): boolean {
	return (
		typeof MediaRecorder !== "undefined" &&
		navigator.mediaDevices !== undefined
	);
}

export class VoiceRecorder {
	/**
	 * Called when a recording nobody stopped reaches the time limit, so the clip
	 * can be dealt with rather than dropped on the floor.
	 */
	#onLimit: (() => void) | undefined;

	constructor(options?: { onLimit?: () => void }) {
		this.#onLimit = options?.onLimit;
	}

	/** Live while the microphone is open, whatever the outcome turns out to be. */
	recording = $state(false);
	elapsedMs = $state(0);

	#stream: MediaStream | null = null;
	#recorder: MediaRecorder | null = null;
	#chunks: Blob[] = [];
	#ticker: ReturnType<typeof setInterval> | null = null;
	#startedAt = 0;
	/**
	 * Set the moment a start is asked for rather than when the microphone
	 * finally opens: permission can take a second, and a second press inside
	 * that gap would otherwise open a second microphone and orphan the first.
	 */
	#starting = false;
	/** A discard that arrived while the microphone was still opening. */
	#abandoned = false;
	/** Resolves with the finished clip, or null when the take was discarded. */
	#finished: Promise<VoiceClip | null> | null = null;

	/** Between asking for the microphone and having closed it again. */
	get busy(): boolean {
		return this.#starting || this.recording;
	}

	/**
	 * Opens the microphone and starts recording. Throws
	 * {@link MicrophoneDeniedError} when the permission is refused, so the caller
	 * can say so rather than reporting a bare DOMException.
	 */
	async start(): Promise<void> {
		if (this.busy) return;
		this.#starting = true;
		this.#abandoned = false;
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch (error) {
			this.#starting = false;
			if (
				error instanceof DOMException &&
				(error.name === "NotAllowedError" ||
					error.name === "SecurityError")
			)
				throw new MicrophoneDeniedError();
			throw error;
		}

		// Given up on while the permission prompt was up: close the microphone
		// that has just this moment opened, and record nothing.
		if (this.#abandoned) {
			for (const track of stream.getTracks()) track.stop();
			this.#starting = false;
			this.#abandoned = false;
			return;
		}

		const mimeType = pickMimeType();
		let recorder: MediaRecorder;
		try {
			recorder = new MediaRecorder(
				stream,
				mimeType === undefined ? undefined : { mimeType },
			);
		} catch (error) {
			// The microphone is already open at this point, and a recorder that
			// refused to exist would otherwise leave it that way for good.
			for (const track of stream.getTracks()) track.stop();
			this.#starting = false;
			throw error;
		}
		this.#stream = stream;
		this.#recorder = recorder;
		this.#chunks = [];
		this.#startedAt = Date.now();
		this.elapsedMs = 0;
		this.recording = true;
		this.#starting = false;

		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) this.#chunks.push(event.data);
		};

		this.#finished = new Promise<VoiceClip | null>((resolve, reject) => {
			recorder.onstop = () => {
				const durationMs = Date.now() - this.#startedAt;
				const chunks = this.#chunks;
				this.#teardown();
				if (chunks.length === 0) {
					resolve(null);
					return;
				}
				const type = recorder.mimeType || mimeType || "audio/mp4";
				const blob = new Blob(chunks, { type });
				blob.arrayBuffer()
					.then((buffer) =>
						resolve({
							bytes: new Uint8Array(buffer),
							// The recorder reports the codecs it chose; the API only
							// wants the container type.
							contentType: type.split(";")[0] ?? type,
							durationMs,
						}),
					)
					.catch(reject);
			};
			recorder.onerror = (event) => {
				this.#teardown();
				reject(
					(event as unknown as { error?: Error }).error ??
						new Error("Recording failed"),
				);
			};
		});

		recorder.start();
		this.#ticker = setInterval(() => {
			this.elapsedMs = Date.now() - this.#startedAt;
			if (this.elapsedMs < MAX_DURATION_MS) return;
			// A recording nobody stopped has to end somewhere, but five minutes of
			// someone's voice is not ours to throw away: the owner is told, and
			// sends it. Stopping the clock first, so this fires once.
			this.#stopTicking();
			this.#onLimit?.();
		}, 100);
	}

	/**
	 * Stops the recording and returns the clip. Throws {@link TooShortError} for
	 * a take too brief to be a message, so a mis-tap does not send anything.
	 */
	async finish(): Promise<VoiceClip> {
		if (
			!this.recording ||
			this.#recorder === null ||
			this.#finished === null
		)
			throw new NotRecordingError();
		const pending = this.#finished;
		const brief = Date.now() - this.#startedAt < MIN_DURATION_MS;
		this.#recorder.stop();
		const clip = await pending;
		if (clip === null || brief) throw new TooShortError();
		return clip;
	}

	/** Throws the take away and closes the microphone. */
	discard(): void {
		if (this.#starting) this.#abandoned = true;
		if (this.#recorder === null) {
			this.#teardown();
			return;
		}
		this.#chunks = [];
		// Stopping still resolves the pending promise, with null now that the
		// chunks are gone, so nobody is left waiting on a take that never lands.
		this.#recorder.stop();
	}

	#stopTicking(): void {
		if (this.#ticker === null) return;
		clearInterval(this.#ticker);
		this.#ticker = null;
	}

	#teardown(): void {
		this.#stopTicking();
		for (const track of this.#stream?.getTracks() ?? []) track.stop();
		this.#stream = null;
		this.#recorder = null;
		this.recording = false;
	}
}
