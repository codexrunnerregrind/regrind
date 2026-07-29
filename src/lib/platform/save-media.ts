import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";
import { AndroidFs } from "tauri-plugin-android-fs-api";
import z from "zod";

import { demoEnabled } from "$lib/demo";
import { fromBase64 } from "$lib/util/base64";

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
	url: string,
	hintMimeType?: string,
): Promise<Fetched> {
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
		contentType?.split(";")[0].trim() ??
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

function buildFilename(extension: string): string {
	const stamp = new Date()
		.toISOString()
		.replace(/[-:T]/g, "")
		.replace(/\..+$/, "");
	return `opengrind_${stamp}.${extension}`;
}

// Saves a chat image or video to the device's gallery (Android) or a
// user-chosen location (desktop), or triggers a browser download in the
// demo/web build. `mimeType` is an optional hint used when the server response
// carries no usable `Content-Type`.
// Returns `true` when the media was saved, `false` when the user cancelled the
// (desktop) save dialog.
export async function saveMediaToDevice(
	url: string,
	mimeType?: string,
): Promise<boolean> {
	const media = await fetchMedia(url, mimeType);
	const filename = buildFilename(media.extension);

	if (demoEnabled) {
		saveViaBrowser(media.bytes, media.mimeType, filename);
		return true;
	}

	if (platform() === "android") {
		const uri = media.isVideo
			? await AndroidFs.createNewPublicVideoFile(
					"Movies",
					filename,
					media.mimeType,
					{
						requestPermission: true,
					},
				)
			: await AndroidFs.createNewPublicImageFile(
					"Pictures",
					filename,
					media.mimeType,
					{ requestPermission: true },
				);
		await AndroidFs.writeFile(uri, media.bytes);
		await AndroidFs.scanPublicFile(uri);
		return true;
	}

	// iOS has no direct "save to Photos" API here, but WKWebView supports the
	// Web Share sheet for files (triggered by the button tap), from which the
	// user can pick "Save Image" / "Save Video".
	if (platform() === "ios") {
		return shareFile(media.bytes, media.mimeType, filename);
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
	if (path === null) return false; // user cancelled
	await writeFile(path, media.bytes);
	return true;
}

// Presents the native share sheet with the file. Returns `false` if the user
// dismisses it. Falls back to a browser download when Web Share is unavailable.
async function shareFile(
	bytes: Uint8Array,
	mimeType: string,
	filename: string,
): Promise<boolean> {
	const file = new File([new Uint8Array(bytes)], filename, { type: mimeType });
	if (navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file] });
			return true;
		} catch (error) {
			// The user dismissing the share sheet is a cancel, not a failure.
			if (error instanceof DOMException && error.name === "AbortError") {
				return false;
			}
			throw error;
		}
	}
	saveViaBrowser(bytes, mimeType, filename);
	return true;
}

function saveViaBrowser(bytes: Uint8Array, mimeType: string, filename: string) {
	const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
}
