import {
	type ApiResponseMessage,
	previewFromMessage,
} from "$lib/model/messaging/messages";
import type { AlbumExpirationType } from "$lib/model/messaging/albums";
import type { Conversation } from "$lib/model/messaging/conversations";
import { DAY, demoMeProfileId, HOUR, MINUTE, NOW } from "../config";
import { hashFromSeed } from "./avatars";
import {
	type DemoConversation,
	demoConversationSeeds,
	type DemoMessage,
} from "./conversation-seeds";
import { demoDrawerMedia } from "./drawer";
import { picsum } from "./picsum";
import { lastOnlineOf, onlineUntilOf, photosOf, profileSeed } from "./profiles";

const MESSAGE_GAP = 7 * MINUTE;
const DEMO_IMAGE_URL = "https://picsum.photos/seed/opengrind-demo/600/800";
const DEMO_VIDEO_URL =
	"https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";

export function conversationIdFor(withId: number): string {
	return `${Math.min(demoMeProfileId, withId)}:${Math.max(demoMeProfileId, withId)}`;
}

const demoConversationById = new Map(
	demoConversationSeeds.map((conv) => [conversationIdFor(conv.withId), conv]),
);

const pinnedOverrides = new Map<string, boolean>();
const mutedOverrides = new Map<string, boolean>();
const deletedConversationIds = new Set<string>();

export function demoSetConversationPinned({
	conversationId,
	pinned,
}: {
	conversationId: string;
	pinned: boolean;
}): void {
	pinnedOverrides.set(conversationId, pinned);
}

export function demoSetConversationMuted({
	conversationId,
	muted,
}: {
	conversationId: string;
	muted: boolean;
}): void {
	mutedOverrides.set(conversationId, muted);
}

export function demoDeleteConversation(conversationId: string): void {
	deletedConversationIds.add(conversationId);
}

function lastActivityOf(conv: DemoConversation): number {
	return NOW - conv.lastActivityAgo * MINUTE;
}

function buildMessage({
	conv,
	message,
	index,
	timestamp,
}: {
	conv: DemoConversation;
	message: DemoMessage;
	index: number;
	timestamp: number;
}): ApiResponseMessage {
	const conversationId = conversationIdFor(conv.withId);
	const messageId = `${index}:demo-${conv.withId}-${index}`;
	const senderId = message.fromMe ? demoMeProfileId : conv.withId;
	const reactions = Array.from({ length: message.reactions ?? 0 }, () => ({
		profileId: message.fromMe ? conv.withId : demoMeProfileId,
		reactionType: 1,
	}));
	const replyToMessage: ApiResponseMessage | null =
		message.replyToText === undefined
			? null
			: {
					type: "Text",
					body: { text: message.replyToText },
					messageId: `${messageId}-quoted`,
					conversationId,
					senderId: message.fromMe ? conv.withId : demoMeProfileId,
					timestamp: timestamp - MINUTE,
					reactions: [],
					unsent: false,
				};
	const base = {
		messageId,
		conversationId,
		senderId,
		timestamp,
		reactions,
		replyToMessage,
	};
	switch (message.kind) {
		case "image":
			return {
				type: "Image",
				body: {
					mediaId: 900_000 + conv.withId,
					width: 600,
					height: 800,
					url: DEMO_IMAGE_URL,
					imageHash: hashFromSeed(`msg-${conv.withId}-${index}`),
					takenOnGrindr: false,
					createdAt: timestamp,
				},
				...base,
				unsent: false,
			};
		case "expiringImage":
			return {
				type: "ExpiringImage",
				body: {
					mediaId: 910_000 + conv.withId + index,
					width: 600,
					height: 800,
					url: picsum({ seed: `expiring-${conv.withId}-${index}` }),
					viewsRemaining: message.expired ? 0 : 1,
				},
				...base,
				unsent: false,
			};
		case "video":
			return {
				type: message.needsLoad ? "Video" : "NonExpiringVideo",
				body: {
					mediaId: 920_000 + conv.withId + index,
					// A view-once video arrives without its URL: it is fetched, and
					// the view spent, only when the bubble is tapped.
					url: message.needsLoad ? null : DEMO_VIDEO_URL,
					contentType: "video/mp4",
					length: 12,
					maxViews: message.needsLoad ? 1 : null,
					looping: false,
					viewsRemaining: message.expired ? 0 : 1,
				},
				...base,
				unsent: false,
			};
		case "album": {
			const albumBody = {
				albumId: message.albumId,
				hasUnseenContent: message.unseen ?? false,
				// Mirrors the API: expiresAt belongs to the signed media URL and is
				// short-lived on every album, expiring or not. The share's own
				// deadline is viewableUntil.
				expiresAt: NOW + 30 * MINUTE,
				expirationType: (message.expiring
					? "ONE_DAY"
					: "INDEFINITE") satisfies AlbumExpirationType,
				coverUrl:
					message.coverUrl === null
						? null
						: message.locked
							? null
							: albumCoverUrl(message.albumId),
				ownerProfileId: message.fromMe ? demoMeProfileId : conv.withId,
				isViewable: !message.locked,
				hasVideo: false,
				hasPhoto: true,
				viewableUntil: message.expiring ? timestamp + DAY : null,
			};
			if (message.expiring === "v2")
				return {
					type: "ExpiringAlbumV2",
					body: albumBody,
					...base,
					unsent: false,
				};
			if (message.expiring === "v1")
				return {
					type: "ExpiringAlbum",
					body: albumBody,
					...base,
					unsent: false,
				};
			return { type: "Album", body: albumBody, ...base, unsent: false };
		}
		case "albumContent": {
			const contentBody = {
				albumId: message.albumId,
				ownerProfileId: message.fromMe ? conv.withId : demoMeProfileId,
				albumContentId: message.albumId * 100,
				previewUrl: message.locked
					? null
					: picsum({
							seed: `album-${message.albumId}-0`,
							width: 300,
							height: 400,
						}),
				expiresAt: message.expired ? timestamp - HOUR : null,
				viewable: !message.locked,
			};
			if (message.reply === undefined) {
				return {
					type: "AlbumContentReaction",
					body: contentBody,
					...base,
					unsent: false,
				};
			}
			return {
				type: "AlbumContentReply",
				body: {
					...contentBody,
					albumContentReply: message.reply,
					contentType: "image/jpeg",
				},
				...base,
				unsent: false,
			};
		}
		case "unsent":
			return { type: "Unsent", body: null, ...base, unsent: true };
		default:
			return {
				type: "Text",
				body: { text: message.text },
				...base,
				unsent: false,
			};
	}
}

function albumCoverUrl(albumId: number): string {
	return picsum({ seed: `album-${albumId}-cover`, width: 300, height: 400 });
}

function threadMessages(conv: DemoConversation): ApiResponseMessage[] {
	const lastActivity = lastActivityOf(conv);
	const count = conv.messages.length;
	const ordered = conv.messages.map((message, i) =>
		buildMessage({
			conv,
			message,
			index: i,
			timestamp: lastActivity - (count - 1 - i) * MESSAGE_GAP,
		}),
	);
	return ordered.reverse();
}

export function demoConversations(page: number): {
	entries: Conversation[];
	nextPage: number | null;
} {
	if (page > 1) return { entries: [], nextPage: null };
	const entries: Conversation[] = demoConversationSeeds
		.filter(
			(conv) => !deletedConversationIds.has(conversationIdFor(conv.withId)),
		)
		.map((conv): Conversation => {
			const conversationId = conversationIdFor(conv.withId);
			const seed = profileSeed(conv.withId);
			const photos = photosOf(conv.withId);
			const latest = threadMessages(conv).at(0);
			return {
				type: "full_conversation_v1",
				data: {
					conversationId,
					name: seed.name ?? "Grindr user",
					participants: [
						{
							profileId: conv.withId,
							primaryMediaHash: photos[0] ?? null,
							lastOnline: lastOnlineOf(seed),
							onlineUntil: onlineUntilOf(seed),
							distanceMetres: seed.distanceM,
							position: seed.position,
							isInAList: seed.favorite,
							hasDatingPotential: false,
						},
					],
					lastActivityTimestamp: lastActivityOf(conv),
					unreadCount: conv.unread,
					preview: previewFromMessage(latest),
					muted: mutedOverrides.get(conversationId) ?? conv.muted,
					pinned: pinnedOverrides.get(conversationId) ?? conv.pinned,
					favorite: conv.favorite,
					rightNow: "NOT_ACTIVE",
					onlineUntil: onlineUntilOf(seed),
					hasUnreadThrob: false,
				},
			};
		})
		.sort(
			(a, b) => b.data.lastActivityTimestamp - a.data.lastActivityTimestamp,
		);
	return { entries, nextPage: null };
}

export function demoConversationMessages({
	conversationId,
	pageKey,
}: {
	conversationId: string;
	pageKey?: string;
}) {
	const conv = demoConversationById.get(conversationId);
	const seed = conv ? profileSeed(conv.withId) : undefined;
	const photos = conv ? photosOf(conv.withId) : [];
	const profile = {
		distance: seed?.distanceM ?? null,
		mediaHash: photos[0] ?? null,
		name: seed?.name ?? null,
		onlineUntil: seed ? onlineUntilOf(seed) : null,
		profileId: conv?.withId ?? 0,
		showDistance: seed?.distanceM !== null && seed?.distanceM !== undefined,
	};
	if (!conv || pageKey !== undefined) {
		return { lastReadTimestamp: null, messages: [], profile };
	}
	const messages = threadMessages(conv);
	const lastReadTimestamp =
		conv.unread > 0 ? (messages[conv.unread]?.timestamp ?? null) : NOW;
	return { lastReadTimestamp, messages, profile };
}

export function demoSingleMessage({
	conversationId,
	messageId,
}: {
	conversationId: string;
	messageId: string;
}) {
	const conv = demoConversationById.get(conversationId);
	const message =
		(conv
			? threadMessages(conv).find((entry) => entry.messageId === messageId)
			: undefined) ?? demoSentMessages.get(messageId);
	return { message: message ?? null };
}

let demoSentCounter = 0;

// Echoed-back sent messages, so a just-sent expiring image can still be
// re-fetched by messageId when its bubble is tapped (getSingleMessage).
const demoSentMessages = new Map<string, ApiResponseMessage>();

export function demoSentMessage(body: unknown): ApiResponseMessage {
	const sent = body as {
		type?: string;
		target?: { targetId?: number };
		body?: unknown;
	};
	const targetId = sent.target?.targetId ?? 0;
	const timestamp = NOW;
	const overlay = {
		messageId: `${timestamp}:demo-sent-${targetId}-${demoSentCounter++}`,
		conversationId: conversationIdFor(targetId),
		senderId: demoMeProfileId,
		timestamp,
		unsent: false,
		reactions: [],
	};
	const remember = (message: ApiResponseMessage): ApiResponseMessage => {
		demoSentMessages.set(message.messageId, message);
		return message;
	};
	if (
		(sent.type === "Image" || sent.type === "ExpiringImage") &&
		sent.body &&
		typeof sent.body === "object"
	) {
		const { mediaId } = sent.body as { mediaId: number };
		const item = demoDrawerMedia().find((media) => media.id === mediaId);
		const url = item?.url ?? DEMO_IMAGE_URL;
		if (sent.type === "ExpiringImage") {
			return remember({
				type: "ExpiringImage",
				body: {
					mediaId,
					width: null,
					height: null,
					url,
					viewsRemaining: 1,
				},
				...overlay,
			});
		}
		return remember({
			type: "Image",
			body: {
				mediaId,
				width: null,
				height: null,
				url,
				imageHash: hashFromSeed(`drawer-${mediaId}`),
				takenOnGrindr: item?.takenOnGrindr ?? false,
				createdAt: item?.createdTs ?? timestamp,
			},
			...overlay,
		});
	}
	if (
		(sent.type === "AlbumContentReply" ||
			sent.type === "AlbumContentReaction") &&
		sent.body &&
		typeof sent.body === "object"
	) {
		const { albumId, albumContentId, albumContentReply } = sent.body as {
			albumId: number;
			albumContentId: number;
			albumContentReply?: string;
		};
		// The real API fills these in from the album; mirror that here so the
		// echoed message renders like a received one.
		const contentBody = {
			albumId,
			ownerProfileId: targetId,
			albumContentId,
			previewUrl: picsum({
				seed: `album-${albumId}-0`,
				width: 300,
				height: 400,
			}),
			expiresAt: null,
			viewable: true,
		};
		if (sent.type === "AlbumContentReaction") {
			return remember({
				type: "AlbumContentReaction",
				body: contentBody,
				...overlay,
			});
		}
		return remember({
			type: "AlbumContentReply",
			body: {
				...contentBody,
				albumContentReply: albumContentReply ?? "",
				contentType: "image/jpeg",
			},
			...overlay,
		});
	}
	return {
		type: "Text",
		body:
			sent.type === "Text" && sent.body && typeof sent.body === "object"
				? (sent.body as { text: string })
				: { text: "" },
		...overlay,
	};
}
