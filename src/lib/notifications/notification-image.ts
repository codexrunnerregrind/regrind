import { invoke } from "@tauri-apps/api/core";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
import z from "zod";

import { fromBase64 } from "$lib/util/base64";
import { unproxyMediaUrl } from "$lib/util/media";

const downloadedMediaSchema = z.object({
	contentType: z.string().nullable(),
	data: z.string(),
});

const DIR = "notifications";

// Downloads a remote image into the app cache and returns a `file://` URL for
// it. Only useful as an iOS notification attachment: the plugin drops
// attachments on desktop, and Android renders its own (see push.svelte.ts).
// Best-effort — returns null on any failure, so the caller falls back to a
// text-only notification. The download goes through Rust because the webview's
// CSP blocks fetching the media CDN directly.
export async function cacheNotificationImage(
	rawUrl: string,
	id: string,
): Promise<string | null> {
	try {
		const url = unproxyMediaUrl(rawUrl);
		const { data } = downloadedMediaSchema.parse(
			await invoke("download_media", { url }),
		);
		const dir = await join(await appCacheDir(), DIR);
		await mkdir(dir, { recursive: true });
		const path = await join(dir, `${id.replace(/[^\w.-]/g, "_")}.jpg`);
		await writeFile(path, fromBase64(data));
		return `file://${path}`;
	} catch (error) {
		console.error("[push] failed to cache notification image", error);
		return null;
	}
}
