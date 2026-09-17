import { DAY, demoMeProfileId, NOW } from "../config";
import { demoMediaUrl, unsplash } from "./avatars";
import { demoConversationSeeds, localDateTime } from "./conversation-seeds";
import { picsum } from "./picsum";
import { photosOf, profileSeed } from "./profiles";

const UNSPLASH_COVER_BLUR = 30;
const UNSPLASH_ALBUM_COVERS = new Map([[5004, "1645973342475-e9fcd3fc0d39"]]);

const ALBUMS_WITH_VIDEO = new Set([5001, 5004]);

function generateAlbumContent(albumId: number) {
	const count = 3 + (albumId % 3);
	return Array.from({ length: count }, (_, i) => {
		const thumb = picsum({
			seed: `album-${albumId}-${i}`,
			width: 300,
			height: 400,
		});
		const video = ALBUMS_WITH_VIDEO.has(albumId) && i === count - 1;
		return {
			contentId: albumId * 100 + i,
			contentType: video ? "video/mp4" : "image/jpeg",
			coverUrl: thumb,
			statusId: 1,
			thumbUrl: thumb,
			url: picsum({ seed: `album-${albumId}-${i}` }),
			processing: false,
			rejectionId: null,
		};
	});
}

const sharedAlbumSeeds = [
	{ albumId: 8001, ownerProfileId: 100001, name: "Beach day" },
	{ albumId: 8002, ownerProfileId: 100004, name: null },
	{ albumId: 8003, ownerProfileId: 100005, name: "Night out" },
	{ albumId: 8004, ownerProfileId: 100007, name: "Trip" },
];

/**
 * Who an album belongs to. The real API answers with the owner's profile id,
 * which the viewer uses both for its header and as the person a reply is
 * addressed to, so the seeds have to agree about it: albums shared with us come
 * from the feed's owners or from whoever shared them in a conversation, and
 * everything else is our own.
 */
function demoAlbumOwner(albumId: number): number {
	const shared = sharedAlbumSeeds.find((seed) => seed.albumId === albumId);
	if (shared) return shared.ownerProfileId;
	for (const conversation of demoConversationSeeds) {
		for (const message of conversation.messages) {
			if (message.kind !== "album" || message.albumId !== albumId)
				continue;
			return message.fromMe ? demoMeProfileId : conversation.withId;
		}
	}
	return demoMeProfileId;
}

export function albumCoverUrl(albumId: number): string {
	const photo = UNSPLASH_ALBUM_COVERS.get(albumId);
	if (photo) {
		return unsplash({
			photo,
			width: 300,
			height: 400,
			blur: UNSPLASH_COVER_BLUR,
		});
	}
	return picsum({ seed: `album-${albumId}-cover`, width: 300, height: 400 });
}

export function demoAlbumContent(albumId: number) {
	// Prefer the mutable store so edits made in demo mode are visible here.
	const owned = demoAlbumStore().find((album) => album.albumId === albumId);
	return {
		albumId,
		hasUnseenContent: false,
		albumName:
			owned?.albumName ??
			sharedAlbumSeeds.find((seed) => seed.albumId === albumId)?.name ??
			null,
		profileId: demoAlbumOwner(albumId),
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
			const thumb = picsum({
				seed: `album-${albumId}-0`,
				width: 300,
				height: 400,
			});
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

/**
 * Records a share so the demo's album state answers the way the real API does —
 * the share request names the recipients under `profiles`.
 */
export function demoShareAlbum(albumId: number, body: unknown) {
	const profiles = (body as { profiles?: { profileId?: number }[] } | null)
		?.profiles;
	if (!profiles) return;
	const existing = albumShareStore(albumId);
	const added = profiles
		.map((p) => p.profileId)
		.filter(
			(id): id is number => id !== undefined && !existing.includes(id),
		);
	if (added.length > 0) demoAlbumShares.set(albumId, [...existing, ...added]);
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

let demoNextContentId = 970_000;

/**
 * The real upload is multipart over a Tauri command rather than a REST route,
 * so this stands in for the command, not for {@link demoRoute}.
 */
export function demoUploadAlbumContent({
	albumId,
	bytes,
	contentType,
}: {
	albumId: number;
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
}) {
	const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
	const item = {
		contentId: demoNextContentId++,
		contentType,
		coverUrl: url,
		statusId: 1,
		thumbUrl: url,
		url,
		processing: false,
		rejectionId: null,
	};
	demoAlbumStore()
		.find((album) => album.albumId === albumId)
		?.content.push(item);
	return { contentId: item.contentId, contentUrl: url };
}

export function demoDeleteAlbumContent(albumId: number, contentId: number) {
	const album = demoAlbumStore().find((item) => item.albumId === albumId);
	if (!album) return;
	album.content = album.content.filter(
		(item) => item.contentId !== contentId,
	);
}

/** Shares given up in this session, so a refetch does not bring them back. */
const demoRemovedShares = new Set<number>();

export function demoRemoveAlbumShare(albumId: number) {
	demoRemovedShares.add(albumId);
}

export function demoSharedAlbumsFeed() {
	const sharedAlbums = sharedAlbumSeeds
		.filter(({ albumId }) => !demoRemovedShares.has(albumId))
		.map(({ albumId, ownerProfileId, name }, i) => {
			const owner = profileSeed(ownerProfileId);
			return {
				albumId,
				albumNumber: i + 1,
				totalAlbumsShared: sharedAlbumSeeds.length,
				hasUnseenContent: i % 2 === 0,
				albumViewable: true,
				name,
				ownerProfileId,
				imageCount: 2 + (albumId % 3),
				videoCount: albumId % 2,
				coverContent: {
					id: albumId * 10,
					contentType: "image/jpeg",
					location: picsum({
						seed: `shared-album-${albumId}-cover`,
						width: 300,
						height: 400,
					}),
					status: "AVAILABLE",
				},
				profile: {
					profileId: ownerProfileId,
					name: owner.name ?? "",
					// The feed hands out a ready-made avatar URL rather than a media
					// hash, so mirror that with the seeded photo's demo URL.
					profileUrl: demoMediaUrl(photosOf(ownerProfileId)[0]),
					onlineUntil: null,
					distanceKm:
						owner.distanceM === null
							? null
							: owner.distanceM / 1000,
				},
			};
		});
	return {
		profileFeeds: [],
		sharedAlbums,
		experimentStatus: 0,
		nonEmptyPersonalAlbumCount: 3,
		emptyAlbumId: null,
	};
}
