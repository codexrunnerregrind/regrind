// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { reportSheetMock, blockUserMock, hideUserMock } = vi.hoisted(() => ({
	reportSheetMock: vi.fn(),
	blockUserMock: vi.fn<() => Promise<void>>(),
	hideUserMock: vi.fn<() => Promise<void>>(),
}));

vi.mock("$lib/components/report/ReportSheet.svelte", () => ({
	default: reportSheetMock,
}));
vi.mock("$lib/api/browse/blocks", () => ({
	blockUser: blockUserMock,
	unblockUser: vi.fn(),
}));
vi.mock("$lib/api/browse/hides", () => ({ hideUser: hideUserMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => ({ showAccountCreated: false }),
}));
vi.mock("$lib/components/report/block-failure", () => ({
	showBlockFailure: vi.fn(),
}));

import ProfileAccount from "./ProfileAccount.svelte";

const PROFILE_ID = 100010;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function renderAccount({ self = false }: { self?: boolean } = {}) {
	const pending = () => ({ revert: vi.fn(), settle: vi.fn() });
	const blocking = pending();
	const hiding = pending();
	const markBlocked = vi.fn(() => blocking);
	const markHidden = vi.fn(() => hiding);
	render(ProfileAccount, {
		props: {
			profileId: PROFILE_ID,
			isNew: false,
			self,
			changingViewability: false,
			markBlocked,
			markHidden,
		},
	});
	return { blocking, markBlocked, hiding, markHidden };
}

beforeEach(() => {
	vi.clearAllMocks();
	blockUserMock.mockResolvedValue(undefined);
	hideUserMock.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it("shows the profile ID", () => {
	renderAccount();
	expect(screen.getByText(String(PROFILE_ID))).toBeTruthy();
	expect(
		screen.getByRole("button", { name: "Copy profile ID" }),
	).toBeTruthy();
});

it("hides the profile", async () => {
	const { hiding, markHidden } = renderAccount();

	await fireEvent.click(screen.getByRole("button", { name: "Hide profile" }));
	await flush();

	expect(markHidden).toHaveBeenCalledOnce();
	expect(hideUserMock).toHaveBeenCalledExactlyOnceWith({
		profileId: PROFILE_ID,
	});
	expect(hiding.settle).toHaveBeenCalledOnce();
});

it("shows a block from the report sheet at once and settles it once confirmed", async () => {
	const block = Promise.withResolvers<void>();
	blockUserMock.mockReturnValueOnce(block.promise);
	const { blocking, markBlocked } = renderAccount();

	const [, props] = reportSheetMock.mock.lastCall as [
		unknown,
		{ onBlock: () => void },
	];
	props.onBlock();
	expect(markBlocked).toHaveBeenCalledOnce();
	expect(blocking.settle).not.toHaveBeenCalled();
	block.resolve();
	await flush();

	expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
		profileId: PROFILE_ID,
	});
	expect(blocking.settle).toHaveBeenCalledOnce();
	expect(blocking.revert).not.toHaveBeenCalled();
});

it("offers neither hiding nor reporting on our own profile", () => {
	renderAccount({ self: true });
	expect(screen.queryByRole("button", { name: "Hide profile" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Report profile" })).toBeNull();
	expect(reportSheetMock).not.toHaveBeenCalled();
});
