// @vitest-environment jsdom

import { cleanup, getAllByRole, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("$lib/haptics", () => ({ playHaptic: playHapticMock }));

const { sendTapMock } = vi.hoisted(() => ({
	sendTapMock: vi.fn(() => Promise.resolve({ isMutual: false })),
}));
vi.mock("$lib/api/interest/taps", () => ({
	sendTap: sendTapMock,
	findSentTap: vi.fn(),
}));

import { TapType } from "$lib/model/interest/taps";
import { contextMenuEvent, rightClick } from "$lib/test/context-menu";
import TapProfileButton from "./TapProfileButton.svelte";

function renderButton() {
	const { getByRole } = render(TapProfileButton, {
		props: { profileId: 2, tapType: null, onTap: () => {} },
	});
	return getByRole("button", { name: "Send a Fire tap" });
}

afterEach(() => {
	cleanup();
	playHapticMock.mockReset();
});

describe("tap menu haptics", () => {
	it("taps once when a touch long press opens the tap menu", () => {
		const button = renderButton();

		button.dispatchEvent(contextMenuEvent({ pointerType: "touch" }));
		button.dispatchEvent(contextMenuEvent({ pointerType: "touch" }));

		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("stays quiet when a right-click opens the tap menu", () => {
		const button = renderButton();

		button.dispatchEvent(contextMenuEvent({ pointerType: "mouse" }));

		expect(playHapticMock).not.toHaveBeenCalled();
	});
});

describe("tap menu", () => {
	it("offers every tap type on a long press", async () => {
		// Let go of any touch hold an earlier test left behind.
		window.dispatchEvent(new Event("pointerup"));
		await new Promise((resolve) => setTimeout(resolve, 600));
		const button = renderButton();

		await rightClick(button);

		expect(
			getAllByRole(document.body, "menuitem").map((item) =>
				item.getAttribute("aria-label"),
			),
		).toEqual(["Send a Cookie tap", "Send a Fire tap", "Send a Demon tap"]);
	});

	it("sends the bubble the finger is lifted on", async () => {
		window.dispatchEvent(new Event("pointerup"));
		await new Promise((resolve) => setTimeout(resolve, 600));
		const button = renderButton();

		await rightClick(button);
		// jsdom lays the button out at 0,0, so the Fire bubble sits at -58,-94.
		document.dispatchEvent(
			new MouseEvent("pointerup", { clientX: -58, clientY: -94 }),
		);

		expect(sendTapMock).toHaveBeenCalledExactlyOnceWith({
			recipientId: 2,
			tapType: TapType.Hot,
		});
	});
});
