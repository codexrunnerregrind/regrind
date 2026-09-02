import { videoCallStatusLabel } from "$lib/model/messaging/video-calls";
import type {
	ApiResponseMessage,
	QuotedMessage,
} from "$lib/model/messaging/messages";

// The three shapes a chat video arrives in. They differ only in how long the
// media stays viewable, so everything downstream treats them alike.
export const VIDEO_MESSAGE_TYPES = [
	"Video",
	"PrivateVideo",
	"NonExpiringVideo",
];

export type MessagePreview = {
	type: string;
	text?: string | null;
	albumId?: number | null;
	imageHash?: string | null;
};

export function previewFromMessage(
	message: ApiResponseMessage | QuotedMessage | undefined,
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
		// The outcome is the whole of what a call status message says, so the
		// preview carries it rather than the bare word "Video call".
		case "VideoCall":
			return {
				type: "VideoCall",
				text: videoCallStatusLabel(message),
				albumId: null,
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

// What a message with nothing quotable in it is called. A voice note, a video
// call, an expiring pic — none of them carry text, and a preview left blank is
// indistinguishable from a conversation with nothing in it, so every type names
// itself instead.
const TYPE_LABELS: Record<string, string> = {
	Album: "Album",
	AlbumContentReaction: "Album",
	AlbumContentReply: "Album",
	Audio: "Voice message",
	ExpiringAlbum: "Album",
	ExpiringAlbumV2: "Album",
	ExpiringImage: "Expiring photo",
	Gaymoji: "Gaymoji",
	Giphy: "GIF",
	Image: "Photo",
	Location: "Location",
	NonExpiringVideo: "Video",
	PrivateVideo: "Video",
	ProfileLink: "Profile",
	ProfilePhotoReply: "Photo",
	RightNowRequest: "Right Now",
	Unsent: "Unsent message",
	Video: "Video",
	VideoCall: "Video call",
};

// Anything the API adds that we do not know by name yet — and the deliberately
// opaque types (Generative, Unknown) — still has to read as something.
const FALLBACK_LABEL = "Message";

export function previewLabel(
	preview: MessagePreview | null | undefined,
): string | null {
	// An empty type is the absence of a message, not a message without a
	// preview: a conversation with no last message names nothing at all.
	if (preview === null || preview === undefined || preview.type === "")
		return null;
	const text = preview.text ?? null;
	if (text !== null) return text;
	if ((preview.albumId ?? null) !== null) return "Album";
	if ((preview.imageHash ?? null) !== null) return "Photo";
	return TYPE_LABELS[preview.type] ?? FALLBACK_LABEL;
}

/**
 * The image to show alongside a quoted message, or null when the quote has
 * nothing to show. A reply to one of several photos is unreadable as the bare
 * word "Photo" — which photo? — so the quote carries the picture itself.
 */
export function replyThumbnailUrl(
	message: ApiResponseMessage | QuotedMessage | null | undefined,
): string | null {
	if (!message) return null;
	return message.type === "Image" ? message.body.url : null;
}

// A quote pill can never be blank, where the inbox can: a message whose text is
// nothing but whitespace still needs a name inside the pill.
export function quoteLabel(preview: MessagePreview): string {
	const label = previewLabel(preview);
	if (label !== null && label.trim() !== "") return label;
	return FALLBACK_LABEL;
}
