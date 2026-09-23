import { beforeEach, describe, expect, it, vi } from "vitest";

const { inspectMediaFile, toastError, showErrorToast } = vi.hoisted(() => ({
	inspectMediaFile: vi.fn(),
	toastError: vi.fn(),
	showErrorToast: vi.fn(),
}));

vi.mock("$lib/platform/media-file", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/media-file")>()),
	inspectMediaFile,
}));
vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast }));

import type { PickedMedia } from "$lib/platform/media-picker";
import { inspectPicks } from "./album-picks";

const clip = {
	source: "desktop",
	key: "clip",
	mimeType: "video/quicktime",
	path: "/tmp/IMG_0001.mov",
} satisfies PickedMedia;

const photo = {
	source: "desktop",
	key: "photo",
	mimeType: "image/jpeg",
	path: "/tmp/IMG_0002.jpg",
} satisfies PickedMedia;

const nonsense = {
	source: "desktop",
	key: "doc",
	mimeType: "application/pdf",
	path: "/tmp/notes.pdf",
} satisfies PickedMedia;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("inspecting album picks", () => {
	it("takes the native inspection, dimensions and all", async () => {
		inspectMediaFile.mockResolvedValue({
			kind: "video",
			size: 900,
			width: 1080,
			height: 1920,
		});

		await expect(inspectPicks([clip])).resolves.toEqual([
			{
				media: clip,
				inspection: {
					kind: "video",
					size: 900,
					width: 1080,
					height: 1920,
				},
			},
		]);
		expect(toastError).not.toHaveBeenCalled();
	});

	// An iPhone recording is not always probable, and upstream's inspection
	// calls a clip it cannot probe unsupported. The album endpoint takes one
	// without its dimensions, so the picker's own type is enough to go on.
	it("falls back to the picker's type for a clip it cannot probe", async () => {
		inspectMediaFile.mockResolvedValue({ kind: "unsupported", size: 4096 });

		await expect(inspectPicks([clip])).resolves.toEqual([
			{ media: clip, inspection: { kind: "video", size: 4096 } },
		]);
		expect(toastError).not.toHaveBeenCalled();
	});

	it("falls back when the inspection fails outright, without crying about it", async () => {
		inspectMediaFile.mockRejectedValue(new Error("no such file"));

		await expect(inspectPicks([photo])).resolves.toEqual([
			{ media: photo, inspection: { kind: "photo", size: 0 } },
		]);
		expect(showErrorToast).not.toHaveBeenCalled();
	});

	it("names a pick that is neither, once", async () => {
		inspectMediaFile.mockResolvedValue({ kind: "unsupported", size: 10 });

		await expect(inspectPicks([nonsense])).resolves.toEqual([]);
		expect(toastError).toHaveBeenCalledExactlyOnceWith(
			"That file isn't a photo or a video",
		);
		expect(showErrorToast).not.toHaveBeenCalled();
	});

	// A failure the fallback cannot answer is reported as itself: "not a photo"
	// would be a guess, and the wrong one.
	it("reports an inspection failure the picker's type cannot cover", async () => {
		const error = new Error("permission denied");
		inspectMediaFile.mockRejectedValue(error);

		await expect(inspectPicks([nonsense])).resolves.toEqual([]);
		expect(showErrorToast).toHaveBeenCalledExactlyOnceWith({
			label: "Couldn't read that file",
			error,
		});
		expect(toastError).not.toHaveBeenCalled();
	});
});
