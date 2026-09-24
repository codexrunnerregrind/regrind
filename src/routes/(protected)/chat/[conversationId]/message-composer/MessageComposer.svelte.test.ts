// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Drafts } from "$lib/chat/drafts.svelte";
import { draftFromMessage } from "$lib/model/messaging/messages";
import { MAX_DURATION_MS } from "$lib/platform/voice-recorder.svelte";

const { conversations } = vi.hoisted(() => ({
	conversations: { drafts: null as Drafts | null },
}));

vi.mock("$app/navigation", () => ({ onNavigate: vi.fn() }));
vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getConversations: () => conversations,
}));

// The reply bar names whose message it quotes, which reaches for the open
// conversation — and that module builds a WsState on import, for a Tauri host a
// jsdom run has no business providing.
vi.mock("../conversation-state.svelte", () => ({
	getConversationState: () => () => ({
		ourProfileId: 1,
		profile: { name: "Sam" },
	}),
}));

// The saved-phrase bar loads the account's phrases as soon as the composer
// mounts; a jsdom run has no backend to answer that.
vi.mock("$lib/api/messaging/phrases", () => ({
	getSavedPhrases: () =>
		Promise.resolve([{ id: "1", text: "Hey there", type: "user" }]),
	createSavedPhrase: () => Promise.resolve(null),
	deleteSavedPhrase: () => Promise.resolve(),
	trackSavedPhraseUsage: () => Promise.resolve(),
}));

const uploadChatAudio = vi.hoisted(() => vi.fn());
vi.mock("$lib/api/messaging/chat-media", () => ({ uploadChatAudio }));

vi.mock("$lib/ws.svelte", () => ({
	ws: {
		status: "connected",
		connect: () => {},
		on: () => Promise.resolve(() => {}),
		onConnected: () => Promise.resolve(() => {}),
		onEventsDropped: () => Promise.resolve(() => {}),
		send: () => {},
		sendCommand: () => Promise.resolve(undefined),
	},
}));

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

class InstantAnimation {
	onfinish: (() => void) | null = null;
	constructor() {
		queueMicrotask(() => this.onfinish?.());
	}
	cancel() {}
}
Element.prototype.animate = () =>
	new InstantAnimation() as unknown as Animation;

import MessageComposer from "./MessageComposer.svelte";

const A = "a:1";
const B = "b:2";

let drafts: Drafts;

function renderComposer({
	conversationId = A,
	onSend = () => {},
	replyTo = null,
	onCancelReply = () => {},
}: {
	conversationId?: string;
	onSend?: (drafts: unknown) => void | Promise<void>;
	replyTo?: unknown;
	onCancelReply?: () => void;
} = {}) {
	const result = render(MessageComposer, {
		props: {
			conversationId,
			onSend,
			disabled: false,
			replyTo,
			onCancelReply,
		} as never,
	});
	return { ...result, textarea: result.container.querySelector("textarea")! };
}

function type(textarea: HTMLTextAreaElement, value: string) {
	return fireEvent.input(textarea, { target: { value } });
}

describe("MessageComposer drafts", () => {
	beforeEach(() => {
		drafts = new Drafts();
		conversations.drafts = drafts;
	});

	afterEach(cleanup);

	it("opens empty when the conversation has no draft", () => {
		expect(renderComposer().textarea.value).toBe("");
	});

	it("restores the stored draft on open", () => {
		drafts.save({ conversationId: A, text: "see you at" });

		expect(renderComposer().textarea.value).toBe("see you at");
	});

	it("saves what was typed when the conversation changes", async () => {
		const { textarea, rerender } = renderComposer();

		await type(textarea, "for a");
		await rerender({ conversationId: B });

		expect(drafts.get(A)).toBe("for a");
	});

	it("swaps to the other conversation's draft instead of carrying text over", async () => {
		drafts.save({ conversationId: B, text: "for b" });
		const { textarea, rerender } = renderComposer();

		await type(textarea, "for a");
		await rerender({ conversationId: B });

		expect(textarea.value).toBe("for b");
	});

	it("empties the composer for a conversation without a draft", async () => {
		const { textarea, rerender } = renderComposer();

		await type(textarea, "for a");
		await rerender({ conversationId: B });

		expect(textarea.value).toBe("");
	});

	it("saves what was typed when the composer goes away", async () => {
		const { textarea, unmount } = renderComposer();

		await type(textarea, "for a");
		unmount();

		expect(drafts.get(A)).toBe("for a");
	});

	it("keeps no draft for a conversation that was only visited", () => {
		const { unmount } = renderComposer();

		unmount();

		expect(drafts.get(A)).toBe("");
	});

	it("takes drafts again for a conversation reopened after it was forgotten", async () => {
		drafts.forget(A);
		const { textarea, unmount } = renderComposer();

		await type(textarea, "hi again");
		unmount();

		expect(drafts.get(A)).toBe("hi again");
	});

	it("takes drafts again after switching to a forgotten conversation", async () => {
		drafts.forget(B);
		const { textarea, rerender, unmount } = renderComposer();

		await rerender({ conversationId: B });
		await type(textarea, "for b");
		unmount();

		expect(drafts.get(B)).toBe("for b");
	});

	it("drops the draft once the message is sent", async () => {
		drafts.save({ conversationId: A, text: "old" });
		const { textarea } = renderComposer();

		await type(textarea, "sending this");
		await fireEvent.submit(textarea.form!);
		await tick();

		expect(drafts.get(A)).toBe("");
		expect(textarea.value).toBe("");
	});

	it("sends the typed text, not the restored draft", async () => {
		drafts.save({ conversationId: A, text: "old" });
		const onSend = vi.fn();
		const { textarea } = renderComposer({ onSend });

		await type(textarea, "sending this");
		await fireEvent.submit(textarea.form!);
		await tick();

		expect(onSend).toHaveBeenCalledWith([
			draftFromMessage({ type: "Text", body: { text: "sending this" } }),
		]);
	});
});

describe("MessageComposer reply bar", () => {
	beforeEach(() => {
		drafts = new Drafts();
		conversations.drafts = drafts;
	});

	afterEach(cleanup);

	function quoted(overrides: Record<string, unknown> = {}) {
		return {
			type: "Text",
			body: { text: "the quoted text" },
			messageId: "msg-quoted",
			conversationId: A,
			senderId: 7,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
			...overrides,
		};
	}

	it("shows nothing when no reply is armed", () => {
		const { queryByLabelText } = renderComposer();

		expect(queryByLabelText("Cancel reply")).toBeNull();
	});

	it("names the message being replied to", () => {
		const { getByText } = renderComposer({ replyTo: quoted() });

		expect(getByText("the quoted text")).toBeTruthy();
	});

	it.each([
		["Image", { mediaId: 1, width: null, height: null }, "Photo"],
		["Audio", { mediaId: 1 }, "Voice message"],
		["Giphy", { id: "g" }, "GIF"],
	])(
		"names a %s reply rather than showing a blank bar",
		(type, body, label) => {
			const { getByText } = renderComposer({
				replyTo: quoted({ type, body }),
			});

			expect(getByText(label)).toBeTruthy();
		},
	);

	it("cancels the reply when the close button is used", async () => {
		const onCancelReply = vi.fn();
		const { getByLabelText } = renderComposer({
			replyTo: quoted(),
			onCancelReply,
		});

		await fireEvent.click(getByLabelText("Cancel reply"));

		expect(onCancelReply).toHaveBeenCalledOnce();
	});

	it("cancels the reply on Escape, so the keyboard can back out", async () => {
		const onCancelReply = vi.fn();
		const { textarea } = renderComposer({
			replyTo: quoted(),
			onCancelReply,
		});

		await fireEvent.keyDown(textarea, { key: "Escape" });

		expect(onCancelReply).toHaveBeenCalledOnce();
	});

	it("hands focus to the composer when a reply is armed", async () => {
		const { textarea } = renderComposer({ replyTo: quoted() });
		await tick();

		expect(document.activeElement).toBe(textarea);
	});
});

class FakeMediaRecorder {
	static instances: FakeMediaRecorder[] = [];
	static isTypeSupported() {
		return true;
	}

	ondataavailable: ((event: { data: Blob }) => void) | null = null;
	onstop: (() => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	mimeType = "audio/mp4";

	constructor() {
		FakeMediaRecorder.instances.push(this);
	}

	start() {}

	stop() {
		this.ondataavailable?.({
			data: new Blob(["clip"], { type: this.mimeType }),
		});
		this.onstop?.();
	}
}

let stoppedTracks = 0;
/** Set by a test to hold the microphone shut until it says otherwise. */
let micOpen: { promise: Promise<void>; resolve: () => void } | null = null;

describe("MessageComposer voice messages", () => {
	beforeEach(() => {
		drafts = new Drafts();
		conversations.drafts = drafts;
		FakeMediaRecorder.instances = [];
		uploadChatAudio.mockReset();
		uploadChatAudio.mockResolvedValue({
			mediaId: 77,
			url: "https://cdns.grindr.com/audio/sent.aac",
			mediaHash: "abc",
		});
		vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
		// Only the clock the recorder reads: jsdom's FileReader and vi.waitFor both
		// need their own timers left alone.
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
		stoppedTracks = 0;
		micOpen = null;
		Object.defineProperty(navigator, "mediaDevices", {
			value: {
				getUserMedia: async () => {
					// The microphone does not always open at once, and how long it
					// takes is what tells a tap from a hold apart wrongly — see the
					// tests that set `micOpen`.
					if (micOpen !== null) await micOpen.promise;
					return {
						getTracks: () => [
							{
								stop: () => {
									stoppedTracks += 1;
								},
							},
						],
					};
				},
			},
			configurable: true,
		});
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	/** jsdom ships no PointerEvent, and a bare Event carries no coordinates. */
	function pointer(
		target: Element,
		type: string,
		{ x = 0, y = 0 }: { x?: number; y?: number } = {},
	) {
		const event = new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
		});
		Object.defineProperty(event, "pointerId", { value: 1 });
		return fireEvent(target, event);
	}

	/** Lets a test hold the microphone shut until it chooses to open it. */
	function deferredVoid() {
		let resolve!: () => void;
		const promise = new Promise<void>((r) => {
			resolve = () => r();
		});
		return { promise, resolve };
	}

	/**
	 * Presses the mic at x=300 and pins the bin to 0–40, so the drag has 280px to
	 * run and anything left of x=207 is past the third that arms the cancel.
	 */
	async function hold(onSend = vi.fn()) {
		const view = renderComposer({ onSend });
		const mic = view.getByLabelText("Record voice message");
		await pointer(mic, "pointerdown", { x: 300 });
		await tick();
		view.getByLabelText(
			"Discard recording",
		).parentElement!.getBoundingClientRect = () =>
			({ left: 0, right: 40, top: 0, bottom: 40 }) as DOMRect;
		return { ...view, mic, onSend };
	}

	it("lays the recording over the composer instead of replacing it", async () => {
		const { container, getByLabelText, getByText } = await hold();

		expect(getByText("‹ Slide to cancel")).toBeTruthy();
		expect(getByLabelText("Discard recording")).toBeTruthy();
		// The field stays mounted underneath, so nothing reflows on the way in or
		// out and the fade reveals it rather than stacking two rows.
		expect(container.querySelector("textarea")).toBeTruthy();
	});

	it("sends on release, and plays it back from the upload", async () => {
		const { mic, onSend } = await hold();

		// Past the point where a hold counts as a recording rather than a mis-tap.
		vi.advanceTimersByTime(1_200);
		await pointer(mic, "pointerup");
		await vi.waitFor(() => expect(onSend).toHaveBeenCalled());

		expect(uploadChatAudio).toHaveBeenCalledWith(
			expect.objectContaining({ contentType: "audio/mp4" }),
		);
		const [[[draft]]] = onSend.mock.calls as [[[Record<string, never>]]];
		expect(draft).toMatchObject({
			outbound: { type: "Audio", body: { mediaId: 77 } },
			optimistic: {
				type: "Audio",
				body: {
					mediaId: 77,
					url: "https://cdns.grindr.com/audio/sent.aac",
				},
			},
		});
	});

	it("throws the take away once the finger is dragged a third of the way", async () => {
		const { mic, getByText, container, onSend } = await hold();

		vi.advanceTimersByTime(1_200);
		// Nowhere near the bin, and not even halfway, which is the whole point.
		await pointer(mic, "pointermove", { x: 190 });
		await tick();
		expect(getByText("Release to cancel")).toBeTruthy();
		await pointer(mic, "pointerup", { x: 190 });
		await tick();

		expect(onSend).not.toHaveBeenCalled();
		expect(uploadChatAudio).not.toHaveBeenCalled();
		expect(container.querySelector("textarea")).toBeTruthy();
	});

	it("sends when the drag stops short of the threshold", async () => {
		const { mic, getByText, onSend } = await hold();

		vi.advanceTimersByTime(1_200);
		await pointer(mic, "pointermove", { x: 250 });
		await tick();
		expect(getByText("‹ Slide to cancel")).toBeTruthy();
		await pointer(mic, "pointerup", { x: 250 });
		await vi.waitFor(() => expect(onSend).toHaveBeenCalled());
	});

	it("still sends when the finger wanders past the threshold and comes back", async () => {
		const { mic, onSend } = await hold();

		vi.advanceTimersByTime(1_200);
		await pointer(mic, "pointermove", { x: 120 });
		await pointer(mic, "pointermove", { x: 290 });
		await pointer(mic, "pointerup", { x: 290 });
		await vi.waitFor(() => expect(onSend).toHaveBeenCalled());

		expect(uploadChatAudio).toHaveBeenCalled();
	});

	it("locks the recorder when the mic is tapped rather than held", async () => {
		const { mic, getByLabelText, getByText, onSend } = await hold();

		// Up again almost at once: that is a tap, and it leaves the recorder
		// running with nobody holding it.
		vi.advanceTimersByTime(200);
		await pointer(mic, "pointerup", { x: 300 });
		await tick();

		expect(onSend).not.toHaveBeenCalled();
		expect(getByText("Tap to stop")).toBeTruthy();

		vi.advanceTimersByTime(3_000);
		await fireEvent.click(getByLabelText("Stop recording"));
		// Stopping only ends the take: it is on screen to be listened to, and
		// nothing has been uploaded yet.
		await vi.waitFor(() =>
			expect(getByLabelText("Play recording")).toBeTruthy(),
		);
		expect(onSend).not.toHaveBeenCalled();
		expect(uploadChatAudio).not.toHaveBeenCalled();

		await fireEvent.click(getByLabelText("Send voice message"));
		await vi.waitFor(() => expect(onSend).toHaveBeenCalled());
	});

	it("throws a reviewed take away without sending it", async () => {
		const { mic, getByLabelText, container, onSend } = await hold();

		vi.advanceTimersByTime(200);
		await pointer(mic, "pointerup", { x: 300 });
		await tick();
		vi.advanceTimersByTime(3_000);
		await fireEvent.click(getByLabelText("Stop recording"));
		await vi.waitFor(() =>
			expect(getByLabelText("Play recording")).toBeTruthy(),
		);

		await fireEvent.click(getByLabelText("Discard recording"));
		await tick();

		expect(onSend).not.toHaveBeenCalled();
		expect(uploadChatAudio).not.toHaveBeenCalled();
		expect(container.querySelector("textarea")).toBeTruthy();
		expect(getByLabelText("Record voice message")).toBeTruthy();
	});

	it("locks a tap the microphone was slow to answer, rather than sending nothing", async () => {
		// The reported bug: the press is measured from the finger going down, the
		// clip from the microphone opening. A slow mic made a tap look like a hold,
		// and sending ~0ms of audio reported "hold on a moment longer".
		micOpen = deferredVoid();
		const view = renderComposer({ onSend: vi.fn() });
		const mic = view.getByLabelText("Record voice message");
		await pointer(mic, "pointerdown", { x: 300 });

		// Held for longer than the tap threshold, but the microphone only opens at
		// the end of it, so there is almost no audio.
		vi.advanceTimersByTime(600);
		micOpen.resolve();
		await vi.waitFor(() =>
			expect(view.getByText("‹ Slide to cancel")).toBeTruthy(),
		);
		await pointer(mic, "pointerup", { x: 300 });
		await tick();

		expect(
			view.queryByText("Hold on a moment longer to record"),
		).toBeNull();
		expect(uploadChatAudio).not.toHaveBeenCalled();
		expect(view.getByText("Tap to stop")).toBeTruthy();
	});

	it("locks a release that lands before the microphone opens", async () => {
		micOpen = deferredVoid();
		const view = renderComposer({ onSend: vi.fn() });
		const mic = view.getByLabelText("Record voice message");
		await pointer(mic, "pointerdown", { x: 300 });

		// Up again before there is any recording at all.
		await pointer(mic, "pointerup", { x: 300 });
		micOpen.resolve();

		// The mic must not be left open with only the bin to close it.
		await vi.waitFor(() =>
			expect(view.getByText("Tap to stop")).toBeTruthy(),
		);
		expect(uploadChatAudio).not.toHaveBeenCalled();
	});

	it("keeps the bin for a locked recording", async () => {
		const { mic, getByLabelText, container, onSend } = await hold();

		vi.advanceTimersByTime(200);
		await pointer(mic, "pointerup", { x: 300 });
		await tick();
		await fireEvent.click(getByLabelText("Discard recording"));
		await tick();

		expect(onSend).not.toHaveBeenCalled();
		expect(container.querySelector("textarea")).toBeTruthy();
		expect(getByLabelText("Record voice message")).toBeTruthy();
	});

	it("keeps a locked recording that runs to the time limit rather than losing it", async () => {
		const { mic, getByLabelText, onSend } = await hold();

		vi.advanceTimersByTime(200);
		await pointer(mic, "pointerup", { x: 300 });
		await tick();
		// Locked and left running: five minutes later the recorder stops itself,
		// and the take is waiting to be sent rather than gone.
		vi.advanceTimersByTime(MAX_DURATION_MS);
		await vi.waitFor(() =>
			expect(getByLabelText("Play recording")).toBeTruthy(),
		);

		expect(onSend).not.toHaveBeenCalled();
		await fireEvent.click(getByLabelText("Send voice message"));
		await vi.waitFor(() => expect(onSend).toHaveBeenCalled());
	});

	it("sends a held recording that runs to the time limit rather than losing it", async () => {
		const { onSend } = await hold();

		// Still held down when the limit lands: there is no review step in the
		// gesture's way, so it goes out as it would have on release.
		vi.advanceTimersByTime(MAX_DURATION_MS);
		await vi.waitFor(() => expect(onSend).toHaveBeenCalled());

		expect(uploadChatAudio).toHaveBeenCalled();
	});

	it("closes the microphone when the conversation is left mid-recording", async () => {
		const { unmount } = await hold();

		unmount();
		await tick();

		expect(stoppedTracks).toBeGreaterThan(0);
		expect(uploadChatAudio).not.toHaveBeenCalled();
	});

	it("tapping the bin discards too, for a pointer that cannot drag", async () => {
		const { getByLabelText, onSend } = await hold();

		vi.advanceTimersByTime(1_200);
		await fireEvent.click(getByLabelText("Discard recording"));
		await tick();

		expect(onSend).not.toHaveBeenCalled();
	});
});

describe("MessageComposer saved phrases", () => {
	beforeEach(() => {
		drafts = new Drafts();
		conversations.drafts = drafts;
	});

	afterEach(cleanup);

	it("replaces the draft with the phrase and hands the field back the caret", async () => {
		const { textarea, getByRole } = renderComposer();
		await type(textarea, "half a thou");
		await tick();

		await fireEvent.click(getByRole("button", { name: "Hey there" }));
		await tick();

		expect(textarea.value).toBe("Hey there");
		expect(document.activeElement).toBe(textarea);
		expect(textarea.selectionStart).toBe("Hey there".length);
	});
});
