import { type MessageKey, t } from "#lib/i18n/index.ts";
import { videoCallStatusLabel } from "#lib/model/messaging/video-calls.ts";
import type {
	ApiResponseMessage,
	QuotedMessage,
} from "#lib/model/messaging/messages.ts";

// The three shapes a chat video arrives in. They differ only in how long the
// media stays viewable, so everything downstream treats them alike.
export const VIDEO_MESSAGE_TYPES = [
	// eslint-disable-next-line no-restricted-syntax -- API type name
	"Video",
	"PrivateVideo",
	"NonExpiringVideo",
];

export type MessagePreview = {
	type: string;
	text?: string | null;
	albumId?: number | null;
	imageHash?: string | null;
	albumContentReply?: string | null;
	photoContentReply?: string | null;
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
		case "AlbumContentReply":
			return {
				type: message.type,
				albumId: message.body.albumId,
				text: message.body.albumContentReply,
				imageHash: null,
			};
		case "Image":
			return {
				type: "Image",
				text: null,
				albumId: null,
				imageHash: message.body.imageHash,
			};
		case "ProfilePhotoReply":
			return {
				type: message.type,
				text: message.body.photoContentReply,
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

const EXPIRING_VIDEO_TYPES = new Set(["Video", "PrivateVideo"]);

const previewTypeKeys = {
	album: "chat.messagePreview.album",
	albumReaction: "chat.messagePreview.albumReaction",
	expiringPhoto: "chat.messagePreview.expiringPhoto",
	expiringVideo: "chat.messagePreview.expiringVideo",
	photo: "chat.messagePreview.photo",
	photoReply: "chat.messagePreview.photoReply",
	unsent: "chat.messagePreview.unsent",
	voiceMessage: "chat.messagePreview.voiceMessage",
	video: "chat.messagePreview.video",
	videoCall: "chat.messagePreview.videoCall",
	gaymoji: "chat.messagePreview.gaymoji",
	gif: "chat.messagePreview.gif",
	location: "chat.messagePreview.location",
	profile: "chat.messagePreview.profile",
	rightNow: "chat.messagePreview.rightNow",
	message: "chat.messagePreview.message",
} as const satisfies Record<string, MessageKey>;

type PreviewType = keyof typeof previewTypeKeys;

type PreviewContent =
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "type"; readonly type: PreviewType };

const labeledTypes: Partial<Record<string, PreviewType>> = {
	Gaymoji: "gaymoji",
	Giphy: "gif",
	Location: "location",
	ProfilePhotoReply: "photoReply",
};

// Every type names itself: a blank preview reads as an empty conversation.
const typeLabels: Partial<Record<string, PreviewType>> = {
	Album: "album",
	AlbumContentReaction: "album",
	AlbumContentReply: "album",
	Audio: "voiceMessage",
	ExpiringAlbum: "album",
	ExpiringAlbumV2: "album",
	ExpiringImage: "expiringPhoto",
	Gaymoji: "gaymoji",
	Giphy: "gif",
	Image: "photo",
	Location: "location",
	NonExpiringVideo: "video",
	PrivateVideo: "expiringVideo",
	ProfileLink: "profile",
	ProfilePhotoReply: "photo",
	RightNowRequest: "rightNow",
	Unsent: "unsent",
	Video: "expiringVideo",
	VideoCall: "videoCall",
};

function mediaType(preview: MessagePreview): PreviewType | null {
	const labeled = labeledTypes[preview.type];
	if (labeled !== undefined) return labeled;
	if ((preview.albumId ?? null) !== null) return "album";
	if (preview.type === "ExpiringImage") return "expiringPhoto";
	if (EXPIRING_VIDEO_TYPES.has(preview.type)) return "expiringVideo";
	if ((preview.imageHash ?? null) !== null || preview.type === "Image") {
		return "photo";
	}
	return null;
}

function previewContent(
	preview: MessagePreview | null | undefined,
): PreviewContent | null {
	if (preview === null || preview === undefined || preview.type === "")
		return null;
	if (preview.type === "AlbumContentReaction") {
		return { kind: "type", type: "albumReaction" };
	}
	const text =
		preview.text ??
		preview.albumContentReply ??
		preview.photoContentReply ??
		null;
	if (text !== null) return { kind: "text", text };
	const type = mediaType(preview) ?? typeLabels[preview.type] ?? "message";
	return { kind: "type", type };
}

// Unlike previewContent, a quote always needs something to render — the inbox
// and the toast deliberately render its null, a quote pill cannot.
function quoteContent(preview: MessagePreview): PreviewContent {
	const content = previewContent(preview);
	if (content?.kind === "type") return content;
	if (content !== null && content.text.trim() !== "") return content;
	return { kind: "type", type: typeLabels[preview.type] ?? "message" };
}

function previewContentLabel(content: PreviewContent): string {
	return content.kind === "text"
		? content.text
		: t(previewTypeKeys[content.type]);
}

/** The picture beside a quoted photo, so a reply to one of several is legible. */
export function replyThumbnailUrl(
	message: ApiResponseMessage | QuotedMessage | null | undefined,
): string | null {
	if (!message) return null;
	return message.type === "Image" ? message.body.url : null;
}

export function previewLabel(
	preview: MessagePreview | null | undefined,
): string | null {
	const content = previewContent(preview);
	return content === null ? null : previewContentLabel(content);
}

export function quoteLabel(preview: MessagePreview): string {
	return previewContentLabel(quoteContent(preview));
}

export function previewIsUserText(
	preview: MessagePreview | null | undefined,
): boolean {
	return previewContent(preview)?.kind === "text";
}

export function quoteIsUserText(preview: MessagePreview): boolean {
	return quoteContent(preview).kind === "text";
}
