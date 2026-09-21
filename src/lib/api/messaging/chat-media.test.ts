import { encode } from "@msgpack/msgpack";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { ApiError } from "$lib/api/api-error";
import { addMediaToDrawer } from "$lib/api/messaging/chat-media";
import { toBase64 } from "$lib/util/base64";

const photo = { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" };

const uploadedUrl = "https://cdns.grindr.com/images/chat/photo.jpg";

const uploadPath = "/v5/chat/media/upload?takenOnGrindr=false";

function uploadResponse({ status, body }: { status: number; body: unknown }) {
	return toBase64(
		encode({
			status,
			body: new TextEncoder().encode(JSON.stringify(body)),
		}),
	);
}

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
		invokeMock.mockResolvedValue(
			uploadResponse({
				status: 200,
				body: {
					mediaId: 910_001,
					url: uploadedUrl,
					mediaHash: "hash-1",
				},
			}),
		);

		await expect(addMediaToDrawer(photo)).resolves.toEqual({
			mediaId: 910_001,
		});

		expect(invokeMock).toHaveBeenCalledWith("upload_media", {
			path: uploadPath,
			signed: false,
			contentType: "image/png",
			data: "AQID",
		});
		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/media/drawer/910001",
			{ method: "PUT" },
		);
		expect(assertOk).toHaveBeenCalledOnce();
	});

	it("stamps the upload when the sender asked for it", async () => {
		invokeMock.mockResolvedValue(
			uploadResponse({
				status: 200,
				body: {
					mediaId: 910_002,
					url: uploadedUrl,
					mediaHash: "hash-2",
				},
			}),
		);

		await addMediaToDrawer({ ...photo, takenOnGrindr: true });

		expect(invokeMock).toHaveBeenCalledWith("upload_media", {
			path: "/v6/chat/media/upload?takenOnGrindr=true",
			signed: true,
			contentType: "image/png",
			data: "AQID",
		});
	});

	it("rejects an upload response with a malformed media id without touching the drawer", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		invokeMock.mockResolvedValue(
			uploadResponse({
				status: 200,
				body: {
					mediaId: "not-a-number",
					url: uploadedUrl,
					mediaHash: "hash-3",
				},
			}),
		);

		await expect(addMediaToDrawer(photo)).rejects.toThrow(ApiError);

		expect(invokeMock).toHaveBeenCalledOnce();
		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("propagates a failed drawer save instead of reporting the media as added", async () => {
		invokeMock.mockResolvedValue(
			uploadResponse({
				status: 200,
				body: {
					mediaId: 910_004,
					url: uploadedUrl,
					mediaHash: "hash-4",
				},
			}),
		);
		assertOk.mockImplementation(() => {
			throw new Error("status 500");
		});

		await expect(addMediaToDrawer(photo)).rejects.toThrow("status 500");

		expect(invokeMock).toHaveBeenCalledOnce();
	});
});
