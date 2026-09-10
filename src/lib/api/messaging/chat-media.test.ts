import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";

const { fetchRestMock, invokeMock } = vi.hoisted(() => ({
	fetchRestMock: vi.fn(),
	invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { addMediaToDrawer } from "$lib/api/messaging/chat-media";

const photo = { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" };

const uploadedUrl = "https://cdns.grindr.com/images/chat/photo.jpg";

const assertOk = vi.fn();

beforeEach(() => {
	assertOk.mockReset();
	fetchRestMock.mockReset();
	invokeMock.mockReset();
	fetchRestMock.mockResolvedValue({ assertOk });
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("addMediaToDrawer", () => {
	it("uploads the given bytes and saves the upload to the drawer", async () => {
		invokeMock.mockResolvedValue({
			mediaId: 910_001,
			url: uploadedUrl,
			mediaHash: "hash-1",
		});

		await expect(addMediaToDrawer(photo)).resolves.toEqual({
			mediaId: 910_001,
		});

		expect(invokeMock).toHaveBeenCalledWith("upload_chat_media", {
			contentType: "image/png",
			takenOnGrindr: false,
			data: "AQID",
		});
		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/media/drawer/910001",
			{ method: "PUT" },
		);
		expect(assertOk).toHaveBeenCalledOnce();
	});

	it("stamps the upload when the sender asked for it", async () => {
		invokeMock.mockResolvedValue({
			mediaId: 910_002,
			url: uploadedUrl,
			mediaHash: "hash-2",
		});

		await addMediaToDrawer({ ...photo, takenOnGrindr: true });

		expect(invokeMock).toHaveBeenCalledWith("upload_chat_media", {
			contentType: "image/png",
			takenOnGrindr: true,
			data: "AQID",
		});
	});

	it("rejects an upload response with a malformed media id without touching the drawer", async () => {
		invokeMock.mockResolvedValue({
			mediaId: "not-a-number",
			url: uploadedUrl,
			mediaHash: "hash-3",
		});

		await expect(addMediaToDrawer(photo)).rejects.toThrow(z.ZodError);

		expect(invokeMock).toHaveBeenCalledOnce();
		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("propagates a failed drawer save instead of reporting the media as added", async () => {
		invokeMock.mockResolvedValue({
			mediaId: 910_004,
			url: uploadedUrl,
			mediaHash: "hash-4",
		});
		assertOk.mockImplementation(() => {
			throw new Error("status 500");
		});

		await expect(addMediaToDrawer(photo)).rejects.toThrow("status 500");

		expect(invokeMock).toHaveBeenCalledOnce();
	});
});
