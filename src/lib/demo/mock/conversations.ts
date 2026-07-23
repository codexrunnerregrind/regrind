import {
	type ApiResponseMessage,
	previewFromMessage,
} from "$lib/model/messaging/messages";
import type { AlbumExpirationType } from "$lib/model/messaging/albums";
import type { Conversation } from "$lib/model/messaging/conversations";
import { DAY, demoMeProfileId, HOUR, MINUTE, NOW } from "../config";
import { hashFromSeed } from "./avatars";
import { lastOnlineOf, onlineUntilOf, photosOf, profileSeed } from "./profiles";

type DemoMessage = { fromMe: boolean; reactions?: number } & (
	| { kind?: "text"; text: string }
	| { kind: "image" }
	| { kind: "expiringImage"; expired?: boolean }
	| {
			kind: "album";
			albumId: number;
			expiring?: "v1" | "v2";
			locked?: boolean;
			unseen?: boolean;
			coverUrl?: null;
	  }
	| {
			kind: "albumContent";
			albumId: number;
			reply?: string;
			locked?: boolean;
			expired?: boolean;
	  }
	| { kind: "unsent" }
);

type DemoConversation = {
	withId: number;
	unread: number;
	pinned: boolean;
	favorite: boolean;
	muted: boolean;
	lastActivityAgo: number;
	messages: DemoMessage[];
};

const demoConversationSeeds: DemoConversation[] = [
	{
		withId: 100001,
		unread: 2,
		pinned: false,
		favorite: true,
		muted: false,
		lastActivityAgo: 4,
		messages: [
			{ fromMe: false, text: "Hey! Lorem ipsum dolor sit amet." },
			{
				fromMe: true,
				text: "Hello — consectetur adipiscing elit.",
				reactions: 1,
			},
			{ fromMe: false, text: "Sed do eiusmod tempor incididunt?" },
			{ fromMe: false, kind: "album", albumId: 5001, unseen: true },
			{
				fromMe: true,
				kind: "albumContent",
				albumId: 5001,
				reply: "this one's great",
			},
			{ fromMe: false, kind: "albumContent", albumId: 5001 },
			{
				fromMe: false,
				kind: "albumContent",
				albumId: 5001,
				reply: "can't see it anymore",
				expired: true,
			},
			{ fromMe: false, kind: "albumContent", albumId: 5001, locked: true },
			// Kept last so this conversation's preview stays an Album, which
			// demo.test.ts asserts.
			{
				fromMe: false,
				kind: "album",
				albumId: 5001,
				coverUrl: null,
				unseen: true,
			},
		],
	},
	{
		withId: 100006,
		unread: 1,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 1,
		messages: [
			{ fromMe: false, text: "👀" },
			{ fromMe: true, text: "Lorem ipsum?" },
			{ fromMe: true, kind: "expiringImage" },
			{ fromMe: false, kind: "expiringImage", expired: true },
			{ fromMe: false, text: "Did you catch it? 🔥" },
			{ fromMe: false, kind: "image", reactions: 1 },
		],
	},
	{
		withId: 100009,
		unread: 0,
		pinned: true,
		favorite: false,
		muted: false,
		lastActivityAgo: 52,
		messages: [
			{ fromMe: true, text: "Quis nostrud exercitation." },
			{ fromMe: false, text: "Ullamco laboris nisi." },
			{ fromMe: true, kind: "unsent" },
			{
				fromMe: false,
				kind: "album",
				albumId: 5002,
				expiring: "v1",
				locked: true,
			},
			{ fromMe: true, text: "Ut aliquip ex ea commodo." },
		],
	},
	{
		withId: 100250,
		unread: 0,
		pinned: false,
		favorite: false,
		muted: true,
		lastActivityAgo: 18,
		messages: [
			{ fromMe: false, text: "Lorem ipsum" },
			{ fromMe: false, kind: "album", albumId: 5003, expiring: "v2" },
			{ fromMe: true, text: "ok 👍" },
		],
	},
	{
		withId: 100777,
		unread: 3,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 7,
		messages: [
			{ fromMe: false, text: "Lorem ipsum dolor sit amet consectetur." },
			{ fromMe: false, text: "Lorem ipsum dolor sit amet." },
			{ fromMe: false, text: "Lorem ipsum dolor sit." },
		],
	},
	{
		withId: 100002,
		unread: 0,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 320,
		messages: [
			{ fromMe: true, text: "Duis aute irure dolor." },
			{ fromMe: false, kind: "expiringImage" },
			{ fromMe: false, text: "🐻 lorem ipsum", reactions: 2 },
		],
	},
];

const MESSAGE_GAP = 7 * MINUTE;
const DEMO_IMAGE_URL = "https://picsum.photos/seed/opengrind-demo/600/800";

function picsum(seed: string, width = 600, height = 800): string {
	return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}

function localDateTime(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 19);
}

export function conversationIdFor(withId: number): string {
	return `${Math.min(demoMeProfileId, withId)}:${Math.max(demoMeProfileId, withId)}`;
}

const demoConversationById = new Map(
	demoConversationSeeds.map((conv) => [conversationIdFor(conv.withId), conv]),
);

const pinnedOverrides = new Map<string, boolean>();
const mutedOverrides = new Map<string, boolean>();
const deletedConversationIds = new Set<string>();

export function demoSetConversationPinned(
	conversationId: string,
	pinned: boolean,
): void {
	pinnedOverrides.set(conversationId, pinned);
}

export function demoSetConversationMuted(
	conversationId: string,
	muted: boolean,
): void {
	mutedOverrides.set(conversationId, muted);
}

export function demoDeleteConversation(conversationId: string): void {
	deletedConversationIds.add(conversationId);
}

function lastActivityOf(conv: DemoConversation): number {
	return NOW - conv.lastActivityAgo * MINUTE;
}

function buildMessage(
	conv: DemoConversation,
	message: DemoMessage,
	index: number,
	timestamp: number,
): ApiResponseMessage {
	const conversationId = conversationIdFor(conv.withId);
	const messageId = `${index}:demo-${conv.withId}-${index}`;
	const senderId = message.fromMe ? demoMeProfileId : conv.withId;
	const reactions = Array.from({ length: message.reactions ?? 0 }, () => ({
		profileId: message.fromMe ? conv.withId : demoMeProfileId,
		reactionType: 1,
	}));
	const base = { messageId, conversationId, senderId, timestamp, reactions };
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
					url: picsum(`expiring-${conv.withId}-${index}`),
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
					: picsum(`album-${message.albumId}-0`, 300, 400),
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
	return picsum(`album-${albumId}-cover`, 300, 400);
}

function threadMessages(conv: DemoConversation): ApiResponseMessage[] {
	const lastActivity = lastActivityOf(conv);
	const count = conv.messages.length;
	const ordered = conv.messages.map((message, i) =>
		buildMessage(
			conv,
			message,
			i,
			lastActivity - (count - 1 - i) * MESSAGE_GAP,
		),
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

export function demoConversationMessages(
	conversationId: string,
	pageKey?: string,
) {
	const conv = demoConversationById.get(conversationId);
	const seed = conv ? profileSeed(conv.withId) : undefined;
	const photos = conv ? photosOf(conv.withId) : [];
	const profile = {
		distance: seed?.distanceM ?? null,
		mediaHash: photos[0] ?? null,
		name: seed?.name ?? null,
		onlineUntil: seed ? onlineUntilOf(seed) : null,
		profileId: conv?.withId ?? 0,
		showDistance: seed?.distanceM != null,
	};
	if (!conv || pageKey !== undefined) {
		return { lastReadTimestamp: null, messages: [], profile };
	}
	const messages = threadMessages(conv);
	const lastReadTimestamp =
		conv.unread > 0 ? (messages[conv.unread]?.timestamp ?? null) : NOW;
	return { lastReadTimestamp, messages, profile };
}

export function demoSingleMessage(conversationId: string, messageId: string) {
	const conv = demoConversationById.get(conversationId);
	const message = conv
		? threadMessages(conv).find((entry) => entry.messageId === messageId)
		: undefined;
	return { message: message ?? null };
}

function generateAlbumContent(albumId: number) {
	const count = 3 + (albumId % 3);
	return Array.from({ length: count }, (_, i) => {
		const thumb = picsum(`album-${albumId}-${i}`, 300, 400);
		return {
			contentId: albumId * 100 + i,
			contentType: "image/jpeg",
			coverUrl: thumb,
			statusId: 1,
			thumbUrl: thumb,
			url: picsum(`album-${albumId}-${i}`),
			processing: false,
			rejectionId: null,
		};
	});
}

export function demoAlbumContent(albumId: number) {
	// Prefer the mutable store so edits made in demo mode are visible here.
	const owned = demoAlbumStore().find((album) => album.albumId === albumId);
	return {
		albumId,
		hasUnseenContent: false,
		albumName: owned?.albumName ?? null,
		profileId: demoMeProfileId,
		albumViewable: true,
		sharedCount: owned?.sharedCount ?? 1,
		createdAt: localDateTime(NOW - 3 * DAY),
		updatedAt: localDateTime(NOW - DAY),
		content: owned?.content ?? generateAlbumContent(albumId),
	};
}

export function demoAlbumsSharedByProfile(profileId: number) {
	return {
		albums: [0, 1].map((index) => {
			const albumId = 8001 + index;
			const thumb = picsum(`album-${albumId}-0`, 300, 400);
			return {
				albumId,
				hasUnseenContent: index === 0,
				albumName: index === 0 ? "Shared with you" : null,
				profileId,
				albumViewable: true,
				expiresAt: null,
				expirationType: "INDEFINITE",
				content: {
					contentId: albumId * 100,
					contentType: "image/jpeg",
					coverUrl: thumb,
					statusId: 1,
				},
				contentCount: { imageCount: 3 + index, videoCount: index },
			};
		}),
	};
}

export function demoAlbumLimits() {
	return {
		subscriptionType: "FreeAlbums",
		maxAlbums: 10,
		maxContentItemsPerAlbum: 30,
		maxShares: 100,
		maxViewableAlbums: 10,
		maxViewableVideos: 10,
		maxContentSizeInBytes: 125_829_120,
		maxContentSizeHumanReadable: "120.00 MB",
		maxVideoLength: 60,
		minVideoLength: 1,
		maxShareableAlbums: 10,
		maxVideosPerAlbum: 10,
	};
}

const DEMO_ALBUM_NAMES = ["Gym", "Beach trip", null];
const DEMO_FIRST_ALBUM_ID = 9001;

function buildDemoAlbum(
	albumId: number,
	albumName: string | null,
	sharedCount: number,
	content = generateAlbumContent(albumId),
) {
	return {
		albumId,
		albumName,
		profileId: demoMeProfileId,
		version: 1,
		content,
		isShareable: true,
		sharedCount,
		createdAt: localDateTime(NOW - 3 * DAY),
		updatedAt: localDateTime(NOW - DAY),
	};
}

let demoAlbums: ReturnType<typeof buildDemoAlbum>[] | null = null;
let demoNextAlbumId = DEMO_FIRST_ALBUM_ID + DEMO_ALBUM_NAMES.length;

function demoAlbumStore() {
	demoAlbums ??= DEMO_ALBUM_NAMES.map((albumName, index) =>
		buildDemoAlbum(DEMO_FIRST_ALBUM_ID + index, albumName, index),
	);
	return demoAlbums;
}

const demoAlbumShares = new Map<number, number[]>();

function albumShareStore(albumId: number): number[] {
	let shares = demoAlbumShares.get(albumId);
	if (shares === undefined) {
		// Seed from the demo conversations so the list is not empty to start.
		shares = [100005, 100006];
		demoAlbumShares.set(albumId, shares);
	}
	return shares;
}

export function demoAlbumSharesFor(albumId: number) {
	return { profileIds: albumShareStore(albumId) };
}

export function demoUnshareAlbum(albumId: number, body: unknown) {
	const profiles = (body as { profiles?: { profileId?: number }[] } | null)
		?.profiles;
	if (!profiles) return;
	const removed = new Set(profiles.map((p) => p.profileId));
	demoAlbumShares.set(
		albumId,
		albumShareStore(albumId).filter((id) => !removed.has(id)),
	);
}

function albumNameFromBody(body: unknown): string | null {
	return (body as { albumName?: string | null } | null)?.albumName ?? null;
}

export function demoMyAlbums() {
	return { albums: demoAlbumStore() };
}

export function demoCreateAlbum(body: unknown) {
	const albumName = albumNameFromBody(body);
	const album = buildDemoAlbum(demoNextAlbumId++, albumName, 0, []);
	demoAlbumStore().push(album);
	return { albumId: album.albumId, albumName };
}

export function demoRenameAlbum(albumId: number, body: unknown) {
	const albumName = albumNameFromBody(body);
	const album = demoAlbumStore().find((item) => item.albumId === albumId);
	if (album) album.albumName = albumName;
	return { albumId, albumName };
}

export function demoDeleteAlbum(albumId: number) {
	const albums = demoAlbumStore();
	const index = albums.findIndex((item) => item.albumId === albumId);
	if (index !== -1) albums.splice(index, 1);
}

export function demoReorderAlbumContent(albumId: number, body: unknown) {
	const contentIds = (body as { contentIds?: number[] } | null)?.contentIds;
	const album = demoAlbumStore().find((item) => item.albumId === albumId);
	if (!album || !contentIds) return;
	album.content = contentIds
		.map((id) => album.content.find((item) => item.contentId === id))
		.filter((item) => item !== undefined);
}

export function demoDeleteAlbumContent(albumId: number, contentId: number) {
	const album = demoAlbumStore().find((item) => item.albumId === albumId);
	if (!album) return;
	album.content = album.content.filter((item) => item.contentId !== contentId);
}

let demoSentCounter = 0;

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
	if (sent.type === "Image" && sent.body && typeof sent.body === "object") {
		const { mediaId } = sent.body as { mediaId: number };
		const item = demoDrawerMedia().find((media) => media.id === mediaId);
		return {
			type: "Image",
			body: {
				mediaId,
				width: null,
				height: null,
				url: item?.url ?? DEMO_IMAGE_URL,
				imageHash: hashFromSeed(`drawer-${mediaId}`),
				takenOnGrindr: item?.takenOnGrindr ?? false,
				createdAt: item?.createdTs ?? timestamp,
			},
			...overlay,
		};
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

type DemoDrawerMedia = {
	id: number;
	url: string;
	contentType: string;
	createdTs: number;
	used: boolean;
	takenOnGrindr: boolean;
};

let uploadedDrawerMediaId = 920_000;
const uploadedDrawerMedia: DemoDrawerMedia[] = [];

export function demoUploadChatMedia(
	bytes: Uint8Array<ArrayBuffer>,
	contentType: string,
): { mediaId: number; url: string; mediaHash: string } {
	const item: DemoDrawerMedia = {
		id: uploadedDrawerMediaId++,
		url: URL.createObjectURL(new Blob([bytes], { type: contentType })),
		contentType,
		createdTs: Date.now(),
		used: false,
		takenOnGrindr: false,
	};
	uploadedDrawerMedia.unshift(item);
	return {
		mediaId: item.id,
		url: item.url,
		mediaHash: hashFromSeed(`drawer-${item.id}`),
	};
}

export function demoDrawerMedia(): DemoDrawerMedia[] {
	return [
		...uploadedDrawerMedia,
		...Array.from({ length: 10 }, (_, index) => ({
			id: 910_000 + index,
			url: `https://picsum.photos/seed/opengrind-drawer-${index}/600/800`,
			contentType: "image/jpeg",
			createdTs: NOW - (index + 1) * HOUR,
			used: index % 3 === 0,
			takenOnGrindr: false,
		})),
	];
}
