import {
	nativeSource,
	type PickedMedia,
	pickMedia,
	pickMultipleMedia,
	readMediaBytes,
} from "$lib/platform/media-picker";

/**
 * A pick waiting for the sender to frame it.
 *
 * `bytes` and `url` arrive after the entry does. Reading a file the size of a
 * phone clip takes seconds, and the panel has nothing to wait for: it can open
 * on what the picker already told us and fill the preview in when it lands.
 */
export type Pending = {
	key: string;
	contentType: string;
	video: boolean;
	/**
	 * The file's own path or URI, kept for a clip the platform can re-encode:
	 * the native side reads and shrinks it, so the original's bytes are never
	 * handed across the IPC.
	 */
	source: string | null;
	/** The picked file itself, for reading once the entry is on screen. */
	picked: PickedMedia;
	url: string | null;
	bytes: Uint8Array<ArrayBuffer> | null;
};

/** Opens the OS picker. Throws if it could not be opened. */
export async function pickForKind(
	kind: "image" | "video",
): Promise<PickedMedia[]> {
	// One clip at a time — each is its own message — but photos come in batches.
	return kind === "image"
		? await pickMultipleMedia("image")
		: [await pickMedia("video")].filter((one) => one !== null);
}

/** Queue entries for what was picked, without touching the files yet. */
export function toPending({
	picked,
	kind,
	canTranscode,
}: {
	picked: PickedMedia[];
	kind: "image" | "video";
	canTranscode: boolean;
}): Pending[] {
	const fallback = kind === "image" ? "image/jpeg" : "video/mp4";
	return picked.map((item): Pending => {
		const contentType = item.mimeType ?? fallback;
		const video = contentType.startsWith("video/");
		return {
			key: item.key,
			contentType,
			video,
			source: video && canTranscode ? nativeSource(item) : null,
			picked: item,
			url: null,
			bytes: null,
		};
	});
}

/** Reads one entry's file. Throws if it is unreadable. */
export async function readPending(
	item: Pending,
): Promise<{ url: string; bytes: Uint8Array<ArrayBuffer> }> {
	const bytes = await readMediaBytes(item.picked);
	return {
		url: URL.createObjectURL(new Blob([bytes], { type: item.contentType })),
		bytes,
	};
}

/** The queue with `item`'s file read into it. Throws if it is unreadable. */
export async function queueWithRead(
	item: Pending,
	queue: Pending[],
): Promise<{ queue: Pending[]; url: string }> {
	const read = await readPending(item);
	return {
		queue: queue.map((one) =>
			one.key === item.key ? { ...one, ...read } : one,
		),
		url: read.url,
	};
}
