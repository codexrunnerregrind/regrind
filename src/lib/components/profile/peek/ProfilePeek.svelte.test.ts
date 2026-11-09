// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("#lib/haptics.ts", () => ({
	playHaptic: vi.fn(),
	hapticImpact: vi.fn(),
	hapticSelection: vi.fn(),
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("#lib/api/messaging/messages.ts", () => ({
	getConversationMessages: vi.fn(() => Promise.resolve({ messages: [] })),
}));
const { getProfileMock } = vi.hoisted(() => ({
	getProfileMock: vi.fn((): Promise<unknown> => new Promise(() => {})),
}));
vi.mock("#lib/api/users/profiles.ts", () => ({
	getProfile: getProfileMock,
	mergeProfileEditIntoCaches: vi.fn(),
}));
const { sendTapMock } = vi.hoisted(() => ({
	sendTapMock: vi.fn(() => Promise.resolve({ isMutual: false })),
}));
vi.mock("#lib/api/interest/taps.ts", () => ({ sendTap: sendTapMock }));

import ProfilePeek from "./ProfilePeek.svelte";

beforeAll(() => {
	// jsdom has no modal dialogs.
	Object.assign(HTMLDialogElement.prototype, {
		showModal(this: HTMLDialogElement) {
			this.open = true;
		},
		close(this: HTMLDialogElement) {
			this.open = false;
		},
	});
});

afterEach(() => cleanup());

function renderPeek() {
	const anchor = document.createElement("a");
	document.body.append(anchor);
	return render(ProfilePeek, {
		props: {
			anchor,
			profile: {
				profileId: 2,
				displayName: "Sam",
				mediaHash: null,
				isFavorite: false,
			},
			ourProfileId: 1,
			tapSent: false,
			onClose: () => {},
		},
	});
}

describe("peek tap action", () => {
	it("shows the tap as sent once pressed", async () => {
		const { getByRole } = renderPeek();
		const button = getByRole("menuitem", { name: /\bTap$/ });
		await fireEvent.click(button);
		await tick();
		expect(sendTapMock).toHaveBeenCalled();
		expect(getByRole("menuitem", { name: /Tapped$/ })).toBeTruthy();
	});

	it("starts as sent when the profile says we already tapped", async () => {
		getProfileMock.mockResolvedValueOnce({
			isFavorite: false,
			tapped: true,
			tapType: 1,
			sexualPosition: null,
			height: null,
			weight: null,
			bodyType: null,
		});
		const { findByRole } = renderPeek();
		expect(await findByRole("menuitem", { name: /Tapped$/ })).toBeTruthy();
	});
});
