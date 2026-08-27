import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	invokeMock,
	joinMock,
	openMock,
	saveMock,
	writeFileMock,
	platformMock,
	androidFsMock,
} = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	joinMock: vi.fn(),
	openMock: vi.fn(),
	saveMock: vi.fn(),
	writeFileMock: vi.fn(),
	platformMock: vi.fn(),
	androidFsMock: {
		createNewPublicImageFile: vi.fn(),
		createNewPublicVideoFile: vi.fn(),
		writeFile: vi.fn(),
		scanPublicFile: vi.fn(),
	},
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/path", () => ({ join: joinMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: openMock,
	save: saveMock,
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: writeFileMock }));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: platformMock }));
vi.mock("tauri-plugin-android-fs-api", () => ({ AndroidFs: androidFsMock }));
vi.mock("$lib/demo", () => ({ demoEnabled: false }));

import { saveAllMediaToDevice } from "./save-media";

function downloaded(contentType: string) {
	return { contentType, data: "AAECAw==" };
}

function targets(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		url: `https://cdn.example.com/${index}.jpg`,
	}));
}

beforeEach(() => {
	vi.clearAllMocks();
	invokeMock.mockResolvedValue(downloaded("image/jpeg"));
	joinMock.mockImplementation((...parts: string[]) => parts.join("/"));
	openMock.mockResolvedValue("/Users/someone/Pictures");
	platformMock.mockReturnValue("macos");
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveAllMediaToDevice", () => {
	it("asks for one folder and writes every media into it", async () => {
		const progress: number[] = [];

		const result = await saveAllMediaToDevice(targets(3), (done) =>
			progress.push(done),
		);

		expect(result).toEqual({ saved: 3, failed: 0, cancelled: false });
		expect(openMock).toHaveBeenCalledTimes(1);
		expect(saveMock).not.toHaveBeenCalled();
		expect(writeFileMock).toHaveBeenCalledTimes(3);
		expect(progress).toEqual([1, 2, 3]);
	});

	it("numbers the files in the album's order under one timestamp", async () => {
		await saveAllMediaToDevice(targets(2));

		const names = writeFileMock.mock.calls.map(([path]) =>
			String(path).split("/").at(-1),
		);
		expect(names[0]).toMatch(/^opengrind_\d+_001\.jpg$/);
		expect(names[1]).toMatch(/^opengrind_\d+_002\.jpg$/);
		expect(names[0]?.split("_")[1]).toBe(names[1]?.split("_")[1]);
	});

	it("downloads nothing when the folder picker is dismissed", async () => {
		openMock.mockResolvedValue(null);

		const result = await saveAllMediaToDevice(targets(3));

		expect(result).toEqual({ saved: 0, failed: 0, cancelled: true });
		expect(invokeMock).not.toHaveBeenCalled();
		expect(writeFileMock).not.toHaveBeenCalled();
	});

	it("counts a media it cannot fetch and keeps going", async () => {
		invokeMock
			.mockResolvedValueOnce(downloaded("image/jpeg"))
			.mockRejectedValueOnce(new Error("gone"))
			.mockResolvedValueOnce(downloaded("image/jpeg"));

		const result = await saveAllMediaToDevice(targets(3));

		expect(result).toEqual({ saved: 2, failed: 1, cancelled: false });
		expect(writeFileMock).toHaveBeenCalledTimes(2);
	});

	it("writes straight to the Android gallery, with no picker", async () => {
		platformMock.mockReturnValue("android");
		androidFsMock.createNewPublicImageFile.mockResolvedValue("content://1");

		const result = await saveAllMediaToDevice(targets(2));

		expect(result).toEqual({ saved: 2, failed: 0, cancelled: false });
		expect(openMock).not.toHaveBeenCalled();
		expect(androidFsMock.createNewPublicImageFile).toHaveBeenCalledTimes(2);
		expect(androidFsMock.scanPublicFile).toHaveBeenCalledTimes(2);
	});

	it("sends videos to Movies and photos to Pictures", async () => {
		platformMock.mockReturnValue("android");
		androidFsMock.createNewPublicImageFile.mockResolvedValue("content://1");
		androidFsMock.createNewPublicVideoFile.mockResolvedValue("content://2");
		invokeMock
			.mockResolvedValueOnce(downloaded("image/jpeg"))
			.mockResolvedValueOnce(downloaded("video/mp4"));

		await saveAllMediaToDevice(targets(2));

		expect(androidFsMock.createNewPublicImageFile).toHaveBeenCalledTimes(1);
		expect(androidFsMock.createNewPublicVideoFile).toHaveBeenCalledWith(
			"Movies",
			expect.stringMatching(/\.mp4$/),
			"video/mp4",
			{ requestPermission: true },
		);
	});

	it("hands iOS the whole set in one share sheet", async () => {
		platformMock.mockReturnValue("ios");
		const share = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { canShare: () => true, share });

		const result = await saveAllMediaToDevice(targets(3));

		expect(result).toEqual({ saved: 3, failed: 0, cancelled: false });
		expect(openMock).not.toHaveBeenCalled();
		expect(share).toHaveBeenCalledTimes(1);
		expect(share.mock.calls[0]?.[0].files).toHaveLength(3);

		vi.unstubAllGlobals();
	});

	it("offers a fresh tap when iOS says the gesture went stale", async () => {
		platformMock.mockReturnValue("ios");
		const share = vi
			.fn()
			.mockRejectedValueOnce(new DOMException("stale", "NotAllowedError"))
			.mockResolvedValueOnce(undefined);
		vi.stubGlobal("navigator", { canShare: () => true, share });

		const result = await saveAllMediaToDevice(targets(3));

		expect(result.saved).toBe(0);
		expect(result.cancelled).toBe(false);
		expect(result.shareFromGesture).toBeTypeOf("function");
		invokeMock.mockClear();
		const retried = await result.shareFromGesture!();

		expect(retried).toEqual({ saved: 3, failed: 0, cancelled: false });
		expect(invokeMock).not.toHaveBeenCalled();
		expect(share.mock.calls[1]?.[0].files).toHaveLength(3);

		vi.unstubAllGlobals();
	});

	it("reports a dismissed iOS share sheet as a cancel", async () => {
		platformMock.mockReturnValue("ios");
		vi.stubGlobal("navigator", {
			canShare: () => true,
			share: vi
				.fn()
				.mockRejectedValue(new DOMException("dismissed", "AbortError")),
		});

		const result = await saveAllMediaToDevice(targets(2));

		expect(result).toEqual({ saved: 0, failed: 0, cancelled: true });

		vi.unstubAllGlobals();
	});

	it("does nothing at all for an empty album", async () => {
		const result = await saveAllMediaToDevice([]);

		expect(result).toEqual({ saved: 0, failed: 0, cancelled: false });
		expect(openMock).not.toHaveBeenCalled();
	});
});
