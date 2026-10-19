import { beforeEach, describe, expect, it, vi } from "vitest";

const { addDrawerMediaToAlbum, toast, showErrorToast, clearMyAlbumsCache } =
	vi.hoisted(() => ({
		addDrawerMediaToAlbum: vi.fn(),
		toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
		showErrorToast: vi.fn(),
		clearMyAlbumsCache: vi.fn(),
	}));

vi.mock("svelte-sonner", () => ({ toast }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast }));
vi.mock("$lib/chat/my-albums", () => ({ clearMyAlbumsCache }));
vi.mock("$lib/api/messaging/albums", () => ({
	addDrawerMediaToAlbum,
	getAlbumStorageLimits: vi.fn(),
	uploadAlbumContent: vi.fn(),
	uploadAlbumPhotoBytes: vi.fn(),
}));
vi.mock("$lib/platform/media-picker", () => ({ pickMultipleMedia: vi.fn() }));
vi.mock("./album-picks", () => ({ inspectPicks: vi.fn() }));

import { ApiError } from "$lib/api/api-error";
import { AlbumMediaAdder } from "./album-add-media.svelte";

function adder(busy = false) {
	const reload = vi.fn().mockResolvedValue(undefined);
	const media = new AlbumMediaAdder({
		id: () => 4,
		profileId: () => 11,
		content: () => [],
		busy: () => busy,
		reload,
	});
	return { media, reload };
}

function httpError(status: number) {
	return new ApiError({
		message: `HTTP ${status}`,
		request: { method: "POST", path: "/v1/albums" },
		response: { status, body: "" },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("adding drawer media", () => {
	it("adds the chosen ids and re-reads the album", async () => {
		addDrawerMediaToAlbum.mockResolvedValue(undefined);
		const { media, reload } = adder();

		await expect(media.addFromDrawer([900, 901])).resolves.toBe(true);

		expect(addDrawerMediaToAlbum).toHaveBeenCalledWith({
			albumId: 4,
			mediaIds: [900, 901],
		});
		expect(clearMyAlbumsCache).toHaveBeenCalled();
		expect(reload).toHaveBeenCalled();
		expect(toast.success).toHaveBeenCalledWith("2 photos added");
		expect(media.adding).toBe(false);
	});

	it("says the album is full on a plan limit and keeps the sheet open", async () => {
		addDrawerMediaToAlbum.mockRejectedValue(httpError(402));
		const { media, reload } = adder();

		await expect(media.addFromDrawer([900])).resolves.toBe(false);

		expect(toast.error).toHaveBeenCalledWith("This album is full.");
		expect(showErrorToast).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it("toasts any other failure", async () => {
		addDrawerMediaToAlbum.mockRejectedValue(httpError(500));
		const { media } = adder();

		await expect(media.addFromDrawer([900])).resolves.toBe(false);

		expect(showErrorToast).toHaveBeenCalled();
	});

	it("does nothing while a move or deletion is in flight", async () => {
		const { media } = adder(true);

		await expect(media.addFromDrawer([900])).resolves.toBe(false);

		expect(addDrawerMediaToAlbum).not.toHaveBeenCalled();
	});
});
