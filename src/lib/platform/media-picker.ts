import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { toast } from "svelte-sonner";
import {
	AndroidFs,
	type AndroidFsUri,
	type AndroidOpenFilePickerOptions,
} from "tauri-plugin-android-fs-api";
import z from "zod";

import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
import { currentPlatform } from "#lib/platform/os.ts";

export type MediaKind = "image" | "video" | "media";

type MediaFilter = {
	name: PlainMessageKey;
	extensions: string[];
	mimeTypes: string[];
};

const mimeTypesByExtension: Record<string, string> = {
	heic: "image/heic",
	heif: "image/heif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	mov: "video/quicktime",
	mp4: "video/mp4",
	png: "image/png",
	webp: "image/webp",
};

const imageExtensions = ["jpg", "jpeg", "png", "webp"];

const heifExtensions = ["heic", "heif"];

// A clip off an iPhone camera is QuickTime, not MP4; without the extension here
// one is labelled `video/mp4` on the way up, which is a lie about the bytes.
const videoExtensions = ["mp4", "mov"];

const filtersByKind = {
	image: {
		name: "media.picker.filters.image",
		extensions: imageExtensions,
		mimeTypes: ["image/*"],
	},
	video: {
		name: "media.picker.filters.video",
		extensions: videoExtensions,
		mimeTypes: ["video/*"],
	},
	media: {
		name: "media.picker.filters.media",
		extensions: [...imageExtensions, ...videoExtensions],
		mimeTypes: ["image/*", "video/*"],
	},
} satisfies Record<MediaKind, MediaFilter>;

const galleryPicker =
	"Gallery" satisfies AndroidOpenFilePickerOptions["pickerType"];

const iosPicksSchema = z.object({
	picks: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
	failed: z.number().int().nonnegative(),
});

export type PickedMedia = { key: string; mimeType: string | null } & (
	| { source: "android"; uri: AndroidFsUri }
	| { source: "desktop"; path: string }
	| { source: "staged"; id: string; file?: File }
	| { source: "demo"; file: File }
);

export async function pickMedia(kind: MediaKind): Promise<PickedMedia | null> {
	const picked = await pick({ kind, multiple: false });
	return picked[0] ?? null;
}

export function pickMultipleMedia(kind: MediaKind): Promise<PickedMedia[]> {
	return pick({ kind, multiple: true });
}

/**
 * The picker's own handle on the file, for the native side to open directly: a
 * filesystem path on desktop and iOS, a `content://` URI on Android. `null` for
 * a browser `File`, which has no path at all.
 */
export function nativeSource(media: PickedMedia): string | null {
	switch (media.source) {
		case "android":
			return media.uri.uri;
		case "desktop":
			return media.path;
		case "staged":
			return media.file ? null : `staged:${media.id}`;
		case "demo":
			return null;
	}
}

export async function readMediaBytes(
	media: PickedMedia,
): Promise<Uint8Array<ArrayBuffer>> {
	switch (media.source) {
		case "android":
			return AndroidFs.readFile(media.uri);
		case "desktop":
			return readFile(media.path);
		case "staged":
			if (!media.file) {
				return new Uint8Array(
					await invoke<ArrayBuffer>("read_staged_media", {
						id: media.id,
					}),
				);
			}
			return new Uint8Array(await media.file.arrayBuffer());
		case "demo":
			return new Uint8Array(await media.file.arrayBuffer());
	}
}

async function pick({
	kind,
	multiple,
}: {
	kind: MediaKind;
	multiple: boolean;
}): Promise<PickedMedia[]> {
	if (__DEMO__) return pickDemoMedia({ kind, multiple });

	switch (currentPlatform()) {
		case "android":
			return pickAndroidMedia({ kind, multiple });
		case "ios":
			return pickIosMedia({ kind, multiple });
		case "linux":
		case "windows":
			return pickWithDialog({ kind, multiple, decodesHeif: false });
		case "macos":
			return pickWithDialog({ kind, multiple, decodesHeif: true });
	}
}

async function pickIosMedia({
	kind,
	multiple,
}: {
	kind: MediaKind;
	multiple: boolean;
}): Promise<PickedMedia[]> {
	const { picks, failed } = iosPicksSchema.parse(
		await invoke("pick_ios_media", { kind, multiple }),
	);
	if (failed > 0) {
		toast.error(
			t("common.media.errors.pickedItemsLoadFailed", { count: failed }),
		);
	}
	return picks.map(
		({ id, name }): PickedMedia => ({
			source: "staged",
			key: crypto.randomUUID(),
			mimeType: name === null ? null : mimeTypeFromPath(name),
			id,
		}),
	);
}

async function pickWithDialog({
	kind,
	multiple,
	decodesHeif,
}: {
	kind: MediaKind;
	multiple: boolean;
	decodesHeif: boolean;
}): Promise<PickedMedia[]> {
	const { name, extensions } = filtersByKind[kind];
	const offered =
		decodesHeif && kind !== "video"
			? [...extensions, ...heifExtensions]
			: extensions;
	const filters = [{ name: t(name), extensions: offered }];
	const selection = multiple
		? await open({ filters, multiple: true })
		: await open({ filters, multiple: false });
	const paths =
		selection === null
			? []
			: Array.isArray(selection)
				? selection
				: [selection];
	return paths.map(
		(path): PickedMedia => ({
			source: "desktop",
			key: crypto.randomUUID(),
			mimeType: mimeTypeFromPath(path),
			path,
		}),
	);
}

async function pickAndroidMedia({
	kind,
	multiple,
}: {
	kind: MediaKind;
	multiple: boolean;
}): Promise<PickedMedia[]> {
	const { mimeTypes } = filtersByKind[kind];
	const picked = await invoke<string[] | null>("pick_android_media", {
		mimeTypes,
		multiple,
	});
	const uris =
		picked === null
			? await AndroidFs.showOpenFilePicker({
					pickerType: galleryPicker,
					mimeTypes,
					multiple,
				})
			: picked.map(
					(uri): AndroidFsUri => ({ uri, documentTopTreeUri: null }),
				);
	return Promise.all(
		uris.map(
			async (uri): Promise<PickedMedia> => ({
				source: "android",
				key: crypto.randomUUID(),
				mimeType: await AndroidFs.getMimeType(uri),
				uri,
			}),
		),
	);
}

export function mimeTypeFromPath(path: string): string | null {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return mimeTypesByExtension[extension] ?? null;
}

async function pickDemoMedia({
	kind,
	multiple,
}: {
	kind: MediaKind;
	multiple: boolean;
}): Promise<PickedMedia[]> {
	const files = await new Promise<File[]>((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = filtersByKind[kind].mimeTypes.join(",");
		input.multiple = multiple;
		input.onchange = () => resolve(Array.from(input.files ?? []));
		input.oncancel = () => resolve([]);
		input.click();
	});
	return files.map(
		(file): PickedMedia => ({
			source: "demo",
			key: crypto.randomUUID(),
			mimeType: file.type === "" ? null : file.type,
			file,
		}),
	);
}
