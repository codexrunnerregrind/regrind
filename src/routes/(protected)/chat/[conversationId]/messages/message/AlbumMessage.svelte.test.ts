// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	clearAlbumShareState,
	forgetAlbumShared,
	setAlbumShared,
} from "$lib/api/messaging/album-shares-state.svelte";
import type { AlbumMessage as AlbumMessageType } from "$lib/model/messaging/messages";
import AlbumMessage from "./AlbumMessage.svelte";

const OUR_ID = 1;
const PEER_ID = 2;
const ALBUM_ID = 900;

vi.mock("./context", () => ({
	getMessageContext: () => () => ({
		firstInStack: true,
		lastInStack: true,
		indexInStack: 0,
		isOut: true,
		timestamp: 0,
	}),
	getMessageMetaContext: () => () => ({ clone: false, setRef: () => {} }),
	messageRef: () => () => {},
}));

vi.mock("../../conversation-state.svelte", () => ({
	getConversationState: () => () => ({
		ourProfileId: OUR_ID,
		profile: { profileId: PEER_ID },
	}),
}));

vi.mock("$lib/chat/album-viewer", () => ({
	AlbumLockedError: class extends Error {},
	openAlbumLightbox: vi.fn(),
	resolveAlbumForViewing: vi.fn(),
}));

// A locked bubble asks for a cover it can still show; neither answer matters
// here, and a pending promise keeps the fetch out of the assertions.
vi.mock("$lib/chat/my-albums", () => ({
	myAlbumCoverUrl: () => new Promise(() => {}),
}));
vi.mock("$lib/chat/paywall-covers", () => ({
	paywallCoverUrl: () => new Promise(() => {}),
}));

function albumBody({
	isViewable,
}: {
	isViewable: boolean;
}): AlbumMessageType["body"] {
	return {
		albumId: ALBUM_ID,
		ownerProfileId: OUR_ID,
		coverUrl: "https://cdns.grindr.com/albums/cover.jpg",
		isViewable,
		hasPhoto: true,
		hasVideo: false,
		hasUnseenContent: false,
	} as AlbumMessageType["body"];
}

function bubble(isViewable: boolean) {
	const { container } = render(AlbumMessage, {
		props: { message: albumBody({ isViewable }) },
	});
	return {
		label: () =>
			container.querySelector("button")?.getAttribute("aria-label"),
		locked: () => container.querySelector('[aria-label="Locked"]') !== null,
	};
}

describe("AlbumMessage", () => {
	beforeEach(() => {
		clearAlbumShareState();
	});
	afterEach(cleanup);

	it("says what the message said while nothing else knows better", () => {
		expect(bubble(true).label()).toBe("Open album");
		cleanup();
		expect(bubble(false).label()).toBe("Open locked album");
	});

	it("locks a bubble whose share was revoked elsewhere", async () => {
		const { label, locked } = bubble(true);
		expect(label()).toBe("Open album");

		setAlbumShared(ALBUM_ID, PEER_ID, false);
		await Promise.resolve();

		expect(label()).toBe("Open locked album");
		expect(locked(), "the cover says so on its face too").toBe(true);
	});

	it("unlocks a bubble the album was shared back to", async () => {
		const { label, locked } = bubble(false);
		expect(label()).toBe("Open locked album");

		setAlbumShared(ALBUM_ID, PEER_ID, true);
		await Promise.resolve();

		expect(label()).toBe("Open album");
		expect(locked()).toBe(false);
	});

	it("locks on an optimistic revoke, before any request has answered", async () => {
		// What the transcript's own unshare does: record the intent, then send.
		setAlbumShared(ALBUM_ID, PEER_ID, true);
		const { label } = bubble(true);

		setAlbumShared(ALBUM_ID, PEER_ID, false);
		await Promise.resolve();

		expect(label()).toBe("Open locked album");

		// ...and what it does when the request comes back a failure.
		forgetAlbumShared(ALBUM_ID, PEER_ID);
		await Promise.resolve();

		expect(label()).toBe("Open album");
	});

	it("leaves a share recorded for someone else alone", async () => {
		const { label } = bubble(true);

		setAlbumShared(ALBUM_ID, PEER_ID + 1, false);
		await Promise.resolve();

		expect(label()).toBe("Open album");
	});
});
