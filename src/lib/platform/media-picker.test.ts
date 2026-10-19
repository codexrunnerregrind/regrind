import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { androidFsMock, invokeMock, openMock, platformMock, readFileMock } =
	vi.hoisted(() => ({
		androidFsMock: {
			getMimeType: vi.fn(),
			readFile: vi.fn(),
			showOpenFilePicker: vi.fn(),
		},
		openMock: vi.fn(),
		platformMock: vi.fn(),
		readFileMock: vi.fn(),
		invokeMock: vi.fn(),
	}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: readFileMock }));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: platformMock }));
vi.mock("tauri-plugin-android-fs-api", () => ({ AndroidFs: androidFsMock }));

import type { AndroidFsUri } from "tauri-plugin-android-fs-api";

import {
	pickMedia,
	pickMultipleMedia,
	readMediaBytes,
} from "$lib/platform/media-picker";

const photoUri = {
	uri: "content://photo/1",
	documentTopTreeUri: null,
} satisfies AndroidFsUri;

const videoUri = {
	uri: "content://video/2",
	documentTopTreeUri: null,
} satisfies AndroidFsUri;

const firstKey = "00000000-0000-4000-8000-000000000001";
const secondKey = "00000000-0000-4000-8000-000000000002";

const tauri = globalThis as { isTauri?: boolean };

function runningOnAndroid() {
	tauri.isTauri = true;
	platformMock.mockReturnValue("android");
}

beforeEach(() => {
	invokeMock.mockReset();
	openMock.mockReset();
	platformMock.mockReset();
	readFileMock.mockReset();
	androidFsMock.getMimeType.mockReset();
	androidFsMock.readFile.mockReset();
	androidFsMock.showOpenFilePicker.mockReset();
	platformMock.mockReturnValue("macos");
});

afterEach(() => {
	vi.restoreAllMocks();
	delete tauri.isTauri;
});

describe("readMediaBytes", () => {
	it("reads a desktop selection through the filesystem plugin", async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		readFileMock.mockResolvedValue(bytes);

		await expect(
			readMediaBytes({
				source: "desktop",
				key: "desktop-1",
				mimeType: "image/png",
				path: "/tmp/photo.png",
			}),
		).resolves.toBe(bytes);

		expect(readFileMock).toHaveBeenCalledWith("/tmp/photo.png");
	});

	it("reads an Android selection through the android-fs plugin", async () => {
		const bytes = new Uint8Array([4, 5, 6]);
		androidFsMock.readFile.mockResolvedValue(bytes);

		await expect(
			readMediaBytes({
				source: "android",
				key: "android-1",
				mimeType: "image/jpeg",
				uri: photoUri,
			}),
		).resolves.toBe(bytes);

		expect(androidFsMock.readFile).toHaveBeenCalledWith(photoUri);
	});

	it("reads a web selection from the File itself", async () => {
		const file = new File([new Uint8Array([7, 8, 9])], "photo.jpg", {
			type: "image/jpeg",
		});

		await expect(
			readMediaBytes({
				source: "web",
				key: "web-1",
				mimeType: "image/jpeg",
				file,
			}),
		).resolves.toEqual(new Uint8Array([7, 8, 9]));
	});
});

describe("pickMedia", () => {
	it("returns null when the desktop picker is cancelled", async () => {
		openMock.mockResolvedValue(null);

		await expect(pickMedia("image")).resolves.toBeNull();

		expect(openMock).toHaveBeenCalledWith({
			filters: [
				{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
			],
			multiple: false,
		});
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("wraps the single path a desktop picker resolves outside an array", async () => {
		vi.spyOn(crypto, "randomUUID").mockReturnValue(firstKey);
		openMock.mockResolvedValue("/tmp/photo.png");

		await expect(pickMedia("image")).resolves.toEqual({
			source: "desktop",
			key: firstKey,
			mimeType: "image/png",
			path: "/tmp/photo.png",
		});
	});

	it("asks the Android content picker for one video when picking a single video", async () => {
		runningOnAndroid();
		vi.spyOn(crypto, "randomUUID").mockReturnValue(firstKey);
		invokeMock.mockResolvedValue([videoUri.uri]);
		androidFsMock.getMimeType.mockResolvedValue("video/mp4");

		await expect(pickMedia("video")).resolves.toEqual({
			source: "android",
			key: firstKey,
			mimeType: "video/mp4",
			uri: videoUri,
		});

		expect(invokeMock).toHaveBeenCalledExactlyOnceWith(
			"pick_android_media",
			{ mimeTypes: ["video/*"], multiple: false },
		);
	});
});

describe("pickMultipleMedia", () => {
	it("maps desktop selections to fresh keys and known MIME types", async () => {
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(firstKey)
			.mockReturnValueOnce(secondKey);
		openMock.mockResolvedValue(["/tmp/clip.mov", "/tmp/raw.unknown"]);

		await expect(pickMultipleMedia("media")).resolves.toEqual([
			{
				source: "desktop",
				key: firstKey,
				mimeType: "video/quicktime",
				path: "/tmp/clip.mov",
			},
			{
				source: "desktop",
				key: secondKey,
				mimeType: null,
				path: "/tmp/raw.unknown",
			},
		]);

		expect(openMock).toHaveBeenCalledWith({
			filters: [
				{
					name: "Media",
					extensions: ["jpg", "jpeg", "png", "webp", "mp4", "mov"],
				},
			],
			multiple: true,
		});
	});

	it.each([
		["/tmp/photo.jpg", "image/jpeg"],
		["/tmp/photo.jpeg", "image/jpeg"],
		["/tmp/photo.PNG", "image/png"],
		["/tmp/photo.webp", "image/webp"],
		["/tmp/clip.mp4", "video/mp4"],
		["/tmp/clip.MOV", "video/quicktime"],
		["/tmp/clip.webm", null],
		["/tmp/noextension", null],
	])("resolves the MIME type of %s to %s", async (path, mimeType) => {
		vi.spyOn(crypto, "randomUUID").mockReturnValue(firstKey);
		openMock.mockResolvedValue([path]);

		await expect(pickMultipleMedia("media")).resolves.toEqual([
			{ source: "desktop", key: firstKey, mimeType, path },
		]);
	});

	it("narrows the desktop filter to videos for the video kind", async () => {
		openMock.mockResolvedValue([]);

		await pickMultipleMedia("video");

		expect(openMock).toHaveBeenCalledWith({
			filters: [{ name: "Videos", extensions: ["mp4", "mov"] }],
			multiple: true,
		});
	});

	it("opens the Android picker for content when the system routes it to the Photo Picker", async () => {
		runningOnAndroid();
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(firstKey)
			.mockReturnValueOnce(secondKey);
		invokeMock.mockResolvedValue([photoUri.uri, videoUri.uri]);
		androidFsMock.getMimeType
			.mockResolvedValueOnce("image/jpeg")
			.mockResolvedValueOnce("video/mp4");

		await expect(pickMultipleMedia("media")).resolves.toEqual([
			{
				source: "android",
				key: firstKey,
				mimeType: "image/jpeg",
				uri: photoUri,
			},
			{
				source: "android",
				key: secondKey,
				mimeType: "video/mp4",
				uri: videoUri,
			},
		]);

		expect(invokeMock).toHaveBeenCalledExactlyOnceWith(
			"pick_android_media",
			{ mimeTypes: ["image/*", "video/*"], multiple: true },
		);
		expect(androidFsMock.showOpenFilePicker).not.toHaveBeenCalled();
		expect(openMock).not.toHaveBeenCalled();
	});

	it("resolves nothing without the gallery fallback when the Android content picker is cancelled", async () => {
		runningOnAndroid();
		invokeMock.mockResolvedValue([]);

		await expect(pickMultipleMedia("media")).resolves.toEqual([]);
		await expect(pickMedia("image")).resolves.toBeNull();

		expect(androidFsMock.showOpenFilePicker).not.toHaveBeenCalled();
	});

	it("falls back to the Android gallery picker with the same filters when the content picker is unsupported", async () => {
		runningOnAndroid();
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(firstKey)
			.mockReturnValueOnce(secondKey);
		invokeMock.mockResolvedValue(null);
		androidFsMock.showOpenFilePicker.mockResolvedValue([
			photoUri,
			videoUri,
		]);
		androidFsMock.getMimeType
			.mockResolvedValueOnce("image/jpeg")
			.mockResolvedValueOnce("video/mp4");

		await expect(pickMultipleMedia("media")).resolves.toEqual([
			{
				source: "android",
				key: firstKey,
				mimeType: "image/jpeg",
				uri: photoUri,
			},
			{
				source: "android",
				key: secondKey,
				mimeType: "video/mp4",
				uri: videoUri,
			},
		]);

		expect(
			androidFsMock.showOpenFilePicker,
		).toHaveBeenCalledExactlyOnceWith({
			pickerType: "Gallery",
			mimeTypes: ["image/*", "video/*"],
			multiple: true,
		});
		expect(androidFsMock.getMimeType).toHaveBeenCalledWith(photoUri);
		expect(androidFsMock.getMimeType).toHaveBeenCalledWith(videoUri);
		expect(openMock).not.toHaveBeenCalled();
	});

	it("narrows the Android gallery fallback to videos for the video kind", async () => {
		runningOnAndroid();
		invokeMock.mockResolvedValue(null);
		androidFsMock.showOpenFilePicker.mockResolvedValue([]);

		await expect(pickMultipleMedia("video")).resolves.toEqual([]);

		expect(androidFsMock.showOpenFilePicker).toHaveBeenCalledWith({
			pickerType: "Gallery",
			mimeTypes: ["video/*"],
			multiple: true,
		});
	});
});
