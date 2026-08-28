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

// Mutable so one test can look at a bubble that came in rather than went out.
const context = vi.hoisted(() => ({ isOut: true }));

vi.mock("./context", () => ({
	getMessageContext: () => () => ({
		firstInStack: true,
		lastInStack: true,
		indexInStack: 0,
		isOut: context.isOut,
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
	ownerProfileId = OUR_ID,
}: {
	isViewable: boolean;
	ownerProfileId?: number;
}): AlbumMessageType["body"] {
	return {
		albumId: ALBUM_ID,
		ownerProfileId,
		coverUrl: "https://cdns.grindr.com/albums/cover.jpg",
		isViewable,
		hasPhoto: true,
		hasVideo: false,
		hasUnseenContent: false,
	} as AlbumMessageType["body"];
}

function bubble(isViewable: boolean, ownerProfileId = OUR_ID) {
	const { container } = render(AlbumMessage, {
		props: { message: albumBody({ isViewable, ownerProfileId }) },
	});
	return {
		label: () =>
			container.querySelector("button")?.getAttribute("aria-label"),
		locked: () => container.querySelector('[aria-label="Locked"]') !== null,
		cover: () =>
			container.querySelector("img")?.getAttribute("src") ?? null,
	};
}

describe("AlbumMessage", () => {
	beforeEach(() => {
		clearAlbumShareState();
		context.isOut = true;
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

	it("shows no cover for a locked album of theirs, stale url and all", () => {
		// The url on the message is signed at send time and lasts about half an
		// hour, so trying it costs seconds of a broken image before the lock plate
		// it always ends on.
		context.isOut = false;
		expect(bubble(false, PEER_ID).cover()).toBe(null);
	});

	it("still shows the cover on a locked album of ours", () => {
		// Ours is only locked for them: the cover is still current for us.
		expect(bubble(false).cover()).not.toBe(null);
	});

	it("leaves a share recorded for someone else alone", async () => {
		const { label } = bubble(true);

		setAlbumShared(ALBUM_ID, PEER_ID + 1, false);
		await Promise.resolve();

		expect(label()).toBe("Open album");
	});
});
