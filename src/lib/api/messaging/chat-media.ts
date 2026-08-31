import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { demoEnabled, demoUploadChatMedia } from "$lib/demo";
import { mediaUrlSchema } from "$lib/model/media";
import { type PickedMedia, readMediaBytes } from "$lib/platform/media-picker";
import { toBase64 } from "$lib/util/base64";
import { type DrawerMedia, saveMediaToDrawer } from "./drawer";

const mediaUploadResponseSchema = z.object({
	mediaId: z.int(),
	url: mediaUrlSchema,
	mediaHash: z.string(),
});

export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;

async function uploadChatMedia(
	bytes: Uint8Array<ArrayBuffer>,
	options: { contentType: string; takenOnGrindr: boolean },
): Promise<MediaUploadResponse> {
	if (demoEnabled) {
		return demoUploadChatMedia({ bytes, contentType: options.contentType });
	}
	const response = await invoke("upload_chat_media", {
		contentType: options.contentType,
		takenOnGrindr: options.takenOnGrindr,
		data: toBase64(bytes),
	});
	return mediaUploadResponseSchema.parse(response);
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
 * Uploads a video for a chat message. It never enters the drawer — that holds
 * photos — so this hands back the media the message body needs and nothing else.
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

export async function addMediaToDrawer(
	media: PickedMedia,
): Promise<DrawerMedia> {
	const takenOnGrindr = false;
	const bytes = await readMediaBytes(media);
	const contentType = media.mimeType ?? "image/jpeg";
	const uploaded = await uploadChatMedia(bytes, {
		contentType,
		takenOnGrindr,
	});
	await saveMediaToDrawer(uploaded.mediaId);

	return {
		id: uploaded.mediaId,
		url: uploaded.url,
		contentType,
		createdTs: Date.now(),
		used: false,
		takenOnGrindr,
	};
}
