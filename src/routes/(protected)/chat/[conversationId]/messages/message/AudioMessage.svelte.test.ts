// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import Message from "./Message.svelte";

// The bubble reports itself as seen through an observer jsdom does not have.
vi.stubGlobal(
	"IntersectionObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

const getSingleMessage = vi.hoisted(() => vi.fn());
vi.mock("$lib/api/messaging/messages", () => ({ getSingleMessage }));

const showErrorToast = vi.hoisted(() => vi.fn());
vi.mock("$lib/api/error-toast", () => ({ showErrorToast }));

// jsdom implements neither, and `bind:paused` only follows the events they
// would fire, so the element's own `paused` stays true throughout.
const play = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const pause = vi.hoisted(() => vi.fn());
HTMLMediaElement.prototype.play = play;
HTMLMediaElement.prototype.pause = pause;
HTMLMediaElement.prototype.load = vi.fn();

const URL_FRESH = "https://cdns.grindr.com/audio/fresh.aac";
const URL_STALE = "https://cdns.grindr.com/audio/stale.aac";

function audioMessage({
	messageId = "1:abc",
	mediaId = 5,
	url = URL_FRESH,
	length = 4_500,
	expiresAt = null,
	reactions = [],
}: {
	messageId?: string;
	mediaId?: number;
	url?: string;
	length?: number | null;
	expiresAt?: number | null;
	reactions?: { profileId: number; reactionType: number }[];
} = {}): ApiResponseMessage {
	return {
		type: "Audio",
		messageId,
		conversationId: "1:2",
		senderId: 2,
		timestamp: 1_700_000_000_000,
		reactions,
		unsent: false,
		dynamic: false,
		body: {
			mediaId,
			mediaHash: null,
			url,
			contentType: "audio/aac",
			length,
			expiresAt,
		},
	};
}

function bubble(message: ApiResponseMessage, nextAudioMessageId?: string) {
	const { container } = render(Message, {
		props: {
			message,
			isOut: false,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
			nextAudioMessageId,
		},
	});
	return {
		container,
		audio: container.querySelector<HTMLAudioElement>("audio")!,
		playButton: container.querySelector<HTMLButtonElement>(
			'button[aria-label="Play voice message"]',
		)!,
		scrubber: container.querySelector<HTMLElement>('[role="slider"]')!,
	};
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AudioMessage", () => {
	beforeEach(() => {
		play.mockClear();
		pause.mockClear();
		getSingleMessage.mockReset();
		showErrorToast.mockClear();
	});
	afterEach(cleanup);

	it("plays the message's own URL and shows its length", async () => {
		const { audio, playButton, container } = bubble(audioMessage());

		expect(audio.getAttribute("src")).toBe(URL_FRESH);
		// `length` is milliseconds: 4500 reads as four and a half seconds.
		expect(container.textContent).toContain("0:04");

		await fireEvent.click(playButton);
		await settled();

		expect(play).toHaveBeenCalled();
		expect(getSingleMessage).not.toHaveBeenCalled();
	});

	it("refreshes an expired signed URL before playing", async () => {
		getSingleMessage.mockResolvedValue({
			message: audioMessage({ url: URL_FRESH, expiresAt: null }),
		});
		const { audio, playButton } = bubble(
			audioMessage({ url: URL_STALE, expiresAt: Date.now() - 1_000 }),
		);

		expect(audio.getAttribute("src")).toBe(URL_STALE);

		await fireEvent.click(playButton);
		await settled();

		expect(getSingleMessage).toHaveBeenCalledWith({
			conversationId: "1:2",
			messageId: "1:abc",
		});
		expect(audio.getAttribute("src")).toBe(URL_FRESH);
		expect(play).toHaveBeenCalled();
	});

	it("reports a refresh that fails instead of playing a dead URL", async () => {
		getSingleMessage.mockRejectedValue(new Error("gone"));
		const { playButton } = bubble(
			audioMessage({ expiresAt: Date.now() - 1_000 }),
		);

		await fireEvent.click(playButton);
		await settled();

		expect(showErrorToast).toHaveBeenCalled();
		expect(play).not.toHaveBeenCalled();
	});

	it("stops the voice note already playing when another starts", async () => {
		const first = bubble(audioMessage({ messageId: "1:first" }));
		const second = bubble(audioMessage({ messageId: "2:second" }));

		await fireEvent.click(first.playButton);
		await settled();
		expect(pause).not.toHaveBeenCalled();

		await fireEvent.click(second.playButton);
		await settled();
		expect(pause).toHaveBeenCalled();
	});

	it("keeps the reaction pill on the bubble", () => {
		const { audio, container } = bubble(
			audioMessage({ reactions: [{ profileId: 9, reactionType: 1 }] }),
		);
		const reaction = container.querySelector('img[alt="Fire reaction"]');

		// The pill is positioned absolutely, so it lands on the bubble only while
		// the bubble is the positioned ancestor it can hang off.
		expect(reaction).not.toBeNull();
		expect(audio.parentElement?.contains(reaction)).toBe(true);
		expect(audio.parentElement?.className).toContain("relative");
	});

	it("seeks to the tapped point on the track", async () => {
		const { audio, scrubber } = bubble(audioMessage({ length: 10_000 }));
		scrubber.getBoundingClientRect = () =>
			({ left: 0, width: 200 }) as DOMRect;
		scrubber.setPointerCapture = () => {};

		await fireEvent(
			scrubber,
			new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }),
		);

		// Half way along a ten-second note.
		expect(audio.currentTime).toBe(5);
	});

	// A run of voice notes plays through the way WhatsApp's does: reaching the
	// end of one starts the next, and anything else in between ends the run.
	describe("playing on from one note to the next", () => {
		it("starts the voice note below it when one ends", async () => {
			const first = bubble(
				audioMessage({ messageId: "1:a", mediaId: 1 }),
				"1:b",
			);
			const second = bubble(
				audioMessage({ messageId: "1:b", mediaId: 2 }),
			);

			await fireEvent.ended(first.audio);
			await settled();

			expect(play).toHaveBeenCalledTimes(1);
			expect(play.mock.instances[0]).toBe(second.audio);
		});

		it("stops when the message below is not a voice note", async () => {
			const only = bubble(audioMessage({ messageId: "1:a", mediaId: 1 }));

			await fireEvent.ended(only.audio);
			await settled();

			expect(play).not.toHaveBeenCalled();
		});

		it("stops when the voice note below it has scrolled away", async () => {
			const first = bubble(
				audioMessage({ messageId: "1:a", mediaId: 1 }),
				"1:gone",
			);

			await fireEvent.ended(first.audio);
			await settled();

			expect(play).not.toHaveBeenCalled();
		});
	});
});
