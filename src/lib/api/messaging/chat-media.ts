import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { invokeRest } from "$lib/api/transport";
import { demoEnabled, demoUploadChatMedia } from "$lib/demo";
import { mediaUrlSchema } from "$lib/model/media";
import { toBase64 } from "$lib/util/base64";
import { saveMediaToDrawer } from "./drawer";

// Only the id is depended on. A photo's response carries a CDN url and a hash
// too, but nothing here should lose an upload the server accepted over a field
// it may not send for every kind of media.
const mediaUploadResponseSchema = z.object({
	mediaId: z.int(),
	url: mediaUrlSchema.or(z.literal("")).default(""),
	mediaHash: z.string().default(""),
});

export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;

function chatMediaUploadPath(takenOnGrindr: boolean): string {
	return takenOnGrindr
		? "/v6/chat/media/upload?takenOnGrindr=true"
		: "/v5/chat/media/upload?takenOnGrindr=false";
}

async function uploadChatMedia(
	bytes: Uint8Array<ArrayBuffer>,
	options: { contentType: string; takenOnGrindr: boolean },
): Promise<MediaUploadResponse> {
	if (demoEnabled) {
		return demoUploadChatMedia({ bytes, contentType: options.contentType });
	}
	const path = chatMediaUploadPath(options.takenOnGrindr);
	const response = await invokeRest("upload_media", {
		args: {
			path,
			signed: options.takenOnGrindr,
			contentType: options.contentType,
			data: toBase64(bytes),
		},
		requestInfo: { method: "POST", path },
	});
	return response.jsonParsed(mediaUploadResponseSchema);
}

/**
 * Uploads a voice note. Unlike a photo it never enters the drawer — a recording
 * is made to be sent, and there is nothing to pick it out of later.
 */
export async function uploadChatAudio({
	bytes,
	contentType,
	durationMs,
}: {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
	durationMs: number | null;
}): Promise<MediaUploadResponse> {
	if (demoEnabled) {
		return demoUploadChatMedia({ bytes, contentType });
	}
	const response = await invoke("upload_chat_audio", {
		contentType,
		lengthMs: durationMs,
		data: toBase64(bytes),
	});
	return mediaUploadResponseSchema.parse(response);
}

/**
 * Uploads a video for a chat message. Like a photo it may then be kept in the
 * drawer with {@link addMediaToDrawer}; the upload alone only hands back the
 * media the message body needs.
 */
export async function uploadChatVideo({
	bytes,
	contentType,
	durationSeconds,
	looping = false,
}: {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
	durationSeconds: number | null;
	looping?: boolean;
}): Promise<MediaUploadResponse> {
	if (demoEnabled) {
		return demoUploadChatMedia({ bytes, contentType });
	}
	const response = await invoke("upload_chat_video", {
		contentType,
		lengthSeconds: durationSeconds,
		looping,
		data: toBase64(bytes),
	});
	return mediaUploadResponseSchema.parse(response);
}

/**
 * Uploads a clip the platform re-encodes on the way, reading it from the
 * picker's own handle rather than from bytes handed across the IPC.
 */
async function uploadChatVideoFile({
	source,
	durationSeconds,
	looping = false,
}: {
	source: string;
	durationSeconds: number | null;
	looping?: boolean;
}): Promise<MediaUploadResponse> {
	const response = await invoke("upload_chat_video_file", {
		source,
		lengthSeconds: durationSeconds,
		looping,
	});
	return mediaUploadResponseSchema.parse(response);
}

/**
 * Whether the platform can re-encode a clip before sending it. Only where it
 * can does {@link addMediaToDrawer} take `source`; everywhere else a clip goes
 * up as it was picked and the API's size limit applies to it whole.
 */
export async function videoTranscodingSupported(): Promise<boolean> {
	if (demoEnabled) return false;
	return z.boolean().parse(await invoke("video_transcoding_supported"));
}

/**
 * Uploads one photo or clip and keeps it in the drawer, where it can be picked
 * and sent as often as the recipient's patience allows.
 *
 * `takenOnGrindr` is the watermark, and only a photo carries one: it takes the
 * signed upload, which is what stamps the media, so a file off the camera roll
 * is only ever marked when the sender asks for it.
 */
export async function addMediaToDrawer({
	bytes,
	contentType,
	source = null,
	takenOnGrindr = false,
	durationSeconds = null,
}: {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
	/**
	 * The picker's own handle on the file — a path, or a `content://` URI. Given
	 * for a clip on a platform that can re-encode one, which then reads and
	 * shrinks the file itself: tens of megabytes of 4K never cross the IPC, and
	 * what does go up is small enough for the API to accept.
	 */
	source?: string | null;
	takenOnGrindr?: boolean;
	durationSeconds?: number | null;
}): Promise<{ mediaId: number }> {
	const video = contentType.startsWith("video/");
	const uploaded =
		video && source !== null
			? await uploadChatVideoFile({ source, durationSeconds })
			: video
				? await uploadChatVideo({ bytes, contentType, durationSeconds })
				: await uploadChatMedia(bytes, { contentType, takenOnGrindr });
	await saveMediaToDrawer(uploaded.mediaId);
	// The caller re-reads the drawer: the server describes what it kept better
	// than an upload response and a guessed timestamp can.
	return { mediaId: uploaded.mediaId };
}
