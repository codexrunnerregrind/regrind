import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";
import { AndroidFs } from "tauri-plugin-android-fs-api";
import z from "zod";

import { demoEnabled } from "$lib/demo";
import { fromBase64 } from "$lib/util/base64";
import { unproxyMediaUrl } from "$lib/util/media";

const downloadedMediaSchema = z.object({
	contentType: z.string().nullable(),
	data: z.string(),
});

const extensionByMimeType: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"video/mp4": "mp4",
	"video/webm": "webm",
	"video/quicktime": "mov",
};

type Fetched = {
	bytes: Uint8Array;
	mimeType: string;
	isVideo: boolean;
	extension: string;
};

// Downloads the media bytes through Rust (so the request isn't blocked by the
// webview's CORS policy), falling back to a plain fetch in the demo/web build.
async function fetchMedia(
	rawUrl: string,
	hintMimeType?: string,
): Promise<Fetched> {
	// An `ogmedia://` url means nothing to an HTTP client.
	const url = unproxyMediaUrl(rawUrl);
	let bytes: Uint8Array;
	let contentType: string | null;
	if (demoEnabled) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch media: HTTP ${response.status}`);
		}
		bytes = new Uint8Array(await response.arrayBuffer());
		contentType = response.headers.get("content-type");
	} else {
		const { contentType: ct, data } = downloadedMediaSchema.parse(
			await invoke("download_media", { url }),
		);
		bytes = fromBase64(data);
		contentType = ct;
	}
	const mimeType =
		hintMimeType ??
		contentType?.split(";")[0]?.trim() ??
		"application/octet-stream";
	const isVideo = mimeType.startsWith("video/");
	const extension =
		extensionByMimeType[mimeType] ??
		extensionFromUrl(url) ??
		(isVideo ? "mp4" : "jpg");
	return { bytes, mimeType, isVideo, extension };
}

function extensionFromUrl(url: string): string | null {
	try {
		const { pathname } = new URL(url);
		const dot = pathname.lastIndexOf(".");
		if (dot < 0) return null;
		const ext = pathname.slice(dot + 1).toLowerCase();
		return /^[a-z0-9]{2,4}$/.test(ext) ? ext : null;
	} catch {
		return null;
	}
}

function timestamp(): string {
	return new Date().toISOString().replace(/[-:T]/g, "").replace(/\..+$/, "");
}

// One batch shares a stamp and numbers by `index`, so its files sort together
// in the album's order.
function buildFilename(
	extension: string,
	{ stamp = timestamp(), index }: { stamp?: string; index?: number } = {},
): string {
	const suffix =
		index === undefined ? "" : `_${String(index + 1).padStart(3, "0")}`;
	return `opengrind_${stamp}${suffix}.${extension}`;
}

// Saves a chat image or video to the device's gallery (Android) or a
// user-chosen location (desktop), or triggers a browser download in the
// demo/web build. `mimeType` is an optional hint used when the server response
// carries no usable `Content-Type`.
export async function saveMediaToDevice(
	url: string,
	mimeType?: string,
): Promise<SaveResult> {
	const media = await fetchMedia(url, mimeType);
	const filename = buildFilename(media.extension);

	if (demoEnabled) {
		saveViaBrowser(toFile(media, filename), filename);
		return { saved: 1, failed: 0, cancelled: false };
	}

	if (platform() === "android") {
		await saveToAndroidGallery(media, filename);
		return { saved: 1, failed: 0, cancelled: false };
	}

	// iOS has no direct "save to Photos" API here, but WKWebView supports the
	// Web Share sheet for files (triggered by the button tap), from which the
	// user can pick "Save Image" / "Save Video".
	if (platform() === "ios") {
		return shareOrAskForATap([toFile(media, filename)], 0);
	}

	const path = await save({
		defaultPath: filename,
		filters: [
			{
				name: media.isVideo ? "Video" : "Image",
				extensions: [media.extension],
			},
		],
	});
	if (path === null) return { saved: 0, failed: 0, cancelled: true };
	await writeFile(path, media.bytes);
	return { saved: 1, failed: 0, cancelled: false };
}

/** One piece of media to save. `mimeType` is the same optional hint. */
export type MediaToSave = { url: string; mimeType?: string };

/** How a save ended. `cancelled` means the user backed out of a picker. */
export type SaveResult = {
	saved: number;
	failed: number;
	cancelled: boolean;
	/** Set when iOS needs a fresh tap; call it from one. See {@link shareOrAskForATap}. */
	shareFromGesture?: () => Promise<SaveResult>;
};

/**
 * Saves a set to the device, asking where only once: one folder on desktop, one
 * share sheet on iOS. Media that fails to download is counted in `failed`
 * rather than taking the rest with it.
 */
export async function saveAllMediaToDevice(
	targets: MediaToSave[],
	onProgress?: (done: number, total: number) => void,
): Promise<SaveResult> {
	const total = targets.length;
	if (total === 0) return { saved: 0, failed: 0, cancelled: false };

	const stamp = timestamp();
	// Before downloading, so backing out costs no traffic.
	const directory = await pickSaveDirectory();
	if (directory === CANCELLED)
		return { saved: 0, failed: 0, cancelled: true };

	const onIos = !demoEnabled && platform() === "ios";
	// iOS shares the set once at the end; elsewhere each is written as it lands.
	const collected: File[] = [];
	let saved = 0;
	let failed = 0;
	for (const [index, target] of targets.entries()) {
		try {
			const media = await fetchMedia(target.url, target.mimeType);
			const filename = buildFilename(media.extension, { stamp, index });
			if (onIos) {
				collected.push(toFile(media, filename));
			} else if (demoEnabled) {
				saveViaBrowser(toFile(media, filename), filename);
			} else if (platform() === "android") {
				await saveToAndroidGallery(media, filename);
			} else {
				await writeFile(await join(directory, filename), media.bytes);
			}
			saved += 1;
		} catch (error) {
			console.error(error);
			failed += 1;
		}
		onProgress?.(index + 1, total);
	}

	if (onIos) {
		if (collected.length === 0)
			return { saved: 0, failed, cancelled: false };
		return shareOrAskForATap(collected, failed);
	}
	return { saved, failed, cancelled: false };
}

/**
 * WebKit only opens the share sheet while the tap behind it is still active, a
 * window the download can outlast. On that refusal the files are kept and
 * `shareFromGesture` re-shares them from a fresh tap, with no second download.
 */
async function shareOrAskForATap(
	files: File[],
	failed: number,
): Promise<SaveResult> {
	const outcome = await shareFiles(files);
	if (outcome === "stale") {
		return {
			saved: 0,
			failed,
			cancelled: false,
			shareFromGesture: () => shareOrAskForATap(files, failed),
		};
	}
	// Dismissing the sheet loses every file in it.
	return outcome === "shared"
		? { saved: files.length, failed, cancelled: false }
		: { saved: 0, failed, cancelled: true };
}

const CANCELLED = Symbol("cancelled");

async function pickSaveDirectory(): Promise<string | typeof CANCELLED> {
	if (demoEnabled) return "";
	const os = platform();
	if (os === "android" || os === "ios") return "";
	const directory = await open({
		directory: true,
		multiple: false,
		title: "Choose where to save",
	});
	return directory === null ? CANCELLED : directory;
}

async function saveToAndroidGallery(
	media: Fetched,
	filename: string,
): Promise<void> {
	const uri = media.isVideo
		? await AndroidFs.createNewPublicVideoFile(
				"Movies",
				filename,
				media.mimeType,
				{ requestPermission: true },
			)
		: await AndroidFs.createNewPublicImageFile(
				"Pictures",
				filename,
				media.mimeType,
				{ requestPermission: true },
			);
	await AndroidFs.writeFile(uri, media.bytes);
	await AndroidFs.scanPublicFile(uri);
}

/** `stale` is the expired-tap refusal, which is recoverable. */
type ShareOutcome = "shared" | "cancelled" | "stale";

// One sheet for the whole set: iOS offers "Save N Images" from it.
async function shareFiles(files: File[]): Promise<ShareOutcome> {
	if (files.length === 0) return "cancelled";
	if (navigator.canShare?.({ files })) {
		try {
			await navigator.share({ files });
			return "shared";
		} catch (error) {
			if (error instanceof DOMException) {
				if (error.name === "AbortError") return "cancelled";
				if (error.name === "NotAllowedError") return "stale";
			}
			throw error;
		}
	}
	for (const file of files) {
		saveViaBrowser(file, file.name);
	}
	return "shared";
}

function toFile(media: Fetched, filename: string): File {
	return new File([new Uint8Array(media.bytes)], filename, {
		type: media.mimeType,
	});
}

function saveViaBrowser(blob: Blob, filename: string) {
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
}
