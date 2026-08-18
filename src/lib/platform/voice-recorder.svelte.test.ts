// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	MAX_DURATION_MS,
	MicrophoneDeniedError,
	NotRecordingError,
	recordingSupported,
	TooShortError,
	VoiceRecorder,
} from "./voice-recorder.svelte";

class FakeMediaRecorder {
	static instances: FakeMediaRecorder[] = [];
	static supported = ["audio/mp4"];
	static isTypeSupported(type: string) {
		return FakeMediaRecorder.supported.includes(type);
	}

	ondataavailable: ((event: { data: Blob }) => void) | null = null;
	onstop: (() => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	mimeType: string;
	started = false;
	/** Set to drop the take, the way a recorder that captured nothing would. */
	silent = false;

	constructor(
		public stream: { getTracks: () => { stop: () => void }[] },
		options?: { mimeType?: string },
	) {
		this.mimeType = options?.mimeType ?? "audio/webm";
		FakeMediaRecorder.instances.push(this);
	}

	start() {
		this.started = true;
	}

	stop() {
		// A real recorder flushes what it captured, then reports the stop.
		if (!this.silent)
			this.ondataavailable?.({
				data: new Blob(["clip"], { type: this.mimeType }),
			});
		this.onstop?.();
	}

	fail(error: Error) {
		this.onerror?.({ error });
	}
}

let stopped: number;

function stubMicrophone(
	getUserMedia = vi.fn(() =>
		Promise.resolve({
			getTracks: () => [
				{
					stop: () => {
						stopped += 1;
					},
				},
			],
		}),
	),
) {
	Object.defineProperty(navigator, "mediaDevices", {
		value: { getUserMedia },
		configurable: true,
	});
	return getUserMedia;
}

describe("VoiceRecorder", () => {
	beforeEach(() => {
		stopped = 0;
		FakeMediaRecorder.instances = [];
		FakeMediaRecorder.supported = ["audio/mp4"];
		vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
		stubMicrophone();
		// Only the clock the recorder itself watches: jsdom reads a Blob through
		// FileReader, which never fires if its own timers are faked too.
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	const recorder = () => FakeMediaRecorder.instances[0]!;

	it("records at the first type the platform admits to supporting", async () => {
		const voice = new VoiceRecorder();

		await voice.start();

		expect(voice.recording).toBe(true);
		expect(recorder().mimeType).toBe("audio/mp4");
		expect(recorder().started).toBe(true);
	});

	it("hands back the clip, its length, and the container type alone", async () => {
		FakeMediaRecorder.supported = ["audio/webm;codecs=opus"];
		const voice = new VoiceRecorder();
		await voice.start();

		vi.advanceTimersByTime(1_500);
		const clip = await voice.finish();

		expect(clip.contentType).toBe("audio/webm");
		expect(clip.durationMs).toBeGreaterThanOrEqual(1_500);
		expect(clip.bytes.byteLength).toBeGreaterThan(0);
		expect(voice.recording).toBe(false);
		// The microphone is not left open once the clip is in hand.
		expect(stopped).toBe(1);
	});

	it("refuses a take too short to be a message", async () => {
		const voice = new VoiceRecorder();
		await voice.start();

		vi.advanceTimersByTime(100);

		await expect(voice.finish()).rejects.toBeInstanceOf(TooShortError);
		expect(voice.recording).toBe(false);
		expect(stopped).toBe(1);
	});

	it("closes the microphone when the take is thrown away", async () => {
		const voice = new VoiceRecorder();
		await voice.start();

		voice.discard();

		expect(voice.recording).toBe(false);
		expect(stopped).toBe(1);
	});

	it("hands the owner the clip when it reaches the limit, rather than dropping it", async () => {
		const onLimit = vi.fn();
		const voice = new VoiceRecorder({ onLimit });
		await voice.start();

		vi.advanceTimersByTime(MAX_DURATION_MS);

		// Still recording: it is the owner that ends it, so five minutes of
		// someone talking goes somewhere instead of vanishing.
		expect(onLimit).toHaveBeenCalledTimes(1);
		expect(voice.recording).toBe(true);

		const clip = await voice.finish();
		expect(clip.bytes.byteLength).toBeGreaterThan(0);
		expect(stopped).toBe(1);
	});

	it("only reports the limit once", async () => {
		const onLimit = vi.fn();
		const voice = new VoiceRecorder({ onLimit });
		await voice.start();

		vi.advanceTimersByTime(MAX_DURATION_MS * 2);

		expect(onLimit).toHaveBeenCalledTimes(1);
	});

	it("opens one microphone however fast it is asked twice", async () => {
		const getUserMedia = stubMicrophone();
		const voice = new VoiceRecorder();

		// Both before either resolves, which is what a double press does.
		await Promise.all([voice.start(), voice.start()]);

		expect(getUserMedia).toHaveBeenCalledTimes(1);
		expect(FakeMediaRecorder.instances).toHaveLength(1);
	});

	it("closes the microphone when the recorder refuses to start", async () => {
		vi.stubGlobal(
			"MediaRecorder",
			class {
				static isTypeSupported() {
					return true;
				}
				constructor() {
					throw new Error("no encoder");
				}
			},
		);
		const voice = new VoiceRecorder();

		await expect(voice.start()).rejects.toThrow("no encoder");
		// The permission had already been granted, so the track is ours to close.
		expect(stopped).toBe(1);
		expect(voice.recording).toBe(false);
	});

	it("closes a microphone that opened after the take was abandoned", async () => {
		type Granted = { getTracks: () => { stop: () => void }[] };
		let grant: (stream: Granted) => void = () => {};
		stubMicrophone(
			vi.fn(
				() =>
					new Promise<Granted>((resolve) => {
						grant = resolve;
					}),
			),
		);
		const voice = new VoiceRecorder();
		const starting = voice.start();

		// Given up on while the permission prompt was still up.
		voice.discard();
		grant({
			getTracks: () => [
				{
					stop: () => {
						stopped += 1;
					},
				},
			],
		});
		await starting;

		expect(voice.recording).toBe(false);
		expect(voice.busy).toBe(false);
		expect(stopped).toBe(1);
		expect(FakeMediaRecorder.instances).toHaveLength(0);
	});

	it("says plainly when there is nothing to finish", async () => {
		const voice = new VoiceRecorder();

		await expect(voice.finish()).rejects.toBeInstanceOf(NotRecordingError);
	});

	it("counts the time up while it runs", async () => {
		const voice = new VoiceRecorder();
		await voice.start();

		vi.advanceTimersByTime(2_000);

		expect(voice.elapsedMs).toBeGreaterThanOrEqual(2_000);
	});

	it("names a refused microphone as such", async () => {
		stubMicrophone(
			vi.fn(() =>
				Promise.reject(new DOMException("nope", "NotAllowedError")),
			),
		);
		const voice = new VoiceRecorder();

		await expect(voice.start()).rejects.toBeInstanceOf(
			MicrophoneDeniedError,
		);
		expect(voice.recording).toBe(false);
	});

	it("reports a recorder that fails outright", async () => {
		const voice = new VoiceRecorder();
		await voice.start();
		const failing = voice.finish();

		recorder().silent = true;
		recorder().fail(new Error("device went away"));

		await expect(failing).rejects.toThrow("device went away");
		expect(stopped).toBe(1);
	});

	it("knows when the platform cannot record at all", () => {
		expect(recordingSupported()).toBe(true);

		vi.stubGlobal("MediaRecorder", undefined);

		expect(recordingSupported()).toBe(false);
	});
});
