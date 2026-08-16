import type { ApiResponseMessage } from "$lib/model/messaging/messages";

// The three shapes a chat video arrives in. They differ only in how long the
// media stays viewable, so everything downstream treats them alike.
export const VIDEO_MESSAGE_TYPES = [
	"Video",
	"PrivateVideo",
	"NonExpiringVideo",
];

export type MessagePreview = {
	type: string;
	text: string | null;
	albumId: number | null;
	imageHash: string | null;
};

export function previewFromMessage(
	message: ApiResponseMessage | undefined,
): MessagePreview {
	if (!message)
		return { type: "", text: null, albumId: null, imageHash: null };
	switch (message.type) {
		case "Unsent":
			return {
				type: "Unsent",
				text: null,
				albumId: null,
				imageHash: null,
			};
		case "Text":
			return {
				type: "Text",
				text: message.body.text,
				albumId: null,
				imageHash: null,
			};
		case "Image":
			return {
				type: "Image",
				text: null,
				albumId: null,
				imageHash: message.body.imageHash,
			};
		case "Album":
		case "ExpiringAlbum":
		case "ExpiringAlbumV2":
			return {
				type: message.type,
				text: null,
				albumId: message.body.albumId,
				imageHash: null,
			};
		case "ExpiringImage":
		default:
			return {
				type: message.type,
				text: null,
				albumId: null,
				imageHash: null,
			};
	}
}

export function previewLabel(preview: MessagePreview | null): string | null {
	if (preview === null) return null;
	if (preview.text !== null) return preview.text;
	if (preview.albumId !== null) return "Album";
	if (preview.type === "ExpiringImage") return "Expiring photo";
	if (preview.imageHash !== null || preview.type === "Image") return "Photo";
	if (preview.type === "Location") return "Location";
	if (VIDEO_MESSAGE_TYPES.includes(preview.type)) return "Video";
	return null;
}

/**
 * The image to show alongside a quoted message, or null when the quote has
 * nothing to show. A reply to one of several photos is unreadable as the bare
 * word "Photo" — which photo? — so the quote carries the picture itself.
 */
export function replyThumbnailUrl(
	message: ApiResponseMessage | null | undefined,
): string | null {
	if (!message) return null;
	return message.type === "Image" ? message.body.url : null;
}
