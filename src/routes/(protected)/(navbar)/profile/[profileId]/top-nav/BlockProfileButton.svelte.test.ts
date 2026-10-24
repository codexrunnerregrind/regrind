// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { blockUserMock, showBlockFailureMock, preferences } = vi.hoisted(() => ({
	blockUserMock: vi.fn<() => Promise<void>>(),
	showBlockFailureMock: vi.fn(),
	preferences: { confirmBlock: true },
}));

vi.mock("$lib/api/browse/blocks", () => ({ blockUser: blockUserMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => preferences,
}));
vi.mock("$lib/components/report/block-failure", () => ({
	showBlockFailure: showBlockFailureMock,
}));

import BlockProfileButton from "./BlockProfileButton.svelte";

const PROFILE_ID = 100010;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function renderButton() {
	const blocking = { revert: vi.fn(), settle: vi.fn() };
	const markBlocked = vi.fn(() => blocking);
	render(BlockProfileButton, {
		props: {
			profileId: PROFILE_ID,
			changingViewability: false,
			markBlocked,
		},
	});
	return { blocking, markBlocked };
}

const blockButton = () => screen.getByRole("button", { name: "Block profile" });

async function confirmBlock() {
	await fireEvent.click(await screen.findByRole("button", { name: "Block" }));
}

beforeEach(() => {
	vi.clearAllMocks();
	blockUserMock.mockResolvedValue(undefined);
	preferences.confirmBlock = true;
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it("shows the profile as blocked once confirmed and settles once the block is confirmed", async () => {
	const block = Promise.withResolvers<void>();
	blockUserMock.mockReturnValueOnce(block.promise);
	const { blocking, markBlocked } = renderButton();

	await fireEvent.click(blockButton());
	expect(markBlocked).not.toHaveBeenCalled();
	await confirmBlock();
	await flush();
	expect(markBlocked).toHaveBeenCalledOnce();
	expect(blocking.settle).not.toHaveBeenCalled();

	block.resolve();
	await flush();

	expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
		profileId: PROFILE_ID,
	});
	expect(blocking.settle).toHaveBeenCalledOnce();
	expect(showBlockFailureMock).not.toHaveBeenCalled();
});

it("blocks straight away when confirming blocks is turned off", async () => {
	preferences.confirmBlock = false;
	const { blocking, markBlocked } = renderButton();

	await fireEvent.click(blockButton());
	await flush();

	expect(screen.queryByRole("alertdialog")).toBeNull();
	expect(markBlocked).toHaveBeenCalledOnce();
	expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
		profileId: PROFILE_ID,
	});
	expect(blocking.settle).toHaveBeenCalledOnce();
});

it("brings the profile back and explains a block that did not stick", async () => {
	const rejection = new Error("not listed");
	blockUserMock.mockRejectedValueOnce(rejection);
	vi.spyOn(console, "error").mockImplementation(() => {});
	const { blocking } = renderButton();

	await fireEvent.click(blockButton());
	await confirmBlock();
	await flush();

	expect(blocking.revert).toHaveBeenCalledOnce();
	expect(blocking.settle).not.toHaveBeenCalled();
	expect(showBlockFailureMock).toHaveBeenCalledExactlyOnceWith(rejection);
});
