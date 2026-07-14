import { getRightNowFeedV4 } from "$lib/api/right-now";

export type FeedPost = {
	displayName: string | null;
	distance: number | null;
	favorite: boolean;
	hosting: boolean;
	id: number;
	media: FeedPostMedia[]; //TODO
	mediaHash: string | null;
	onlineUntil: number | null;
	posted: number;
	profileId: number;
	recentlyChatted: boolean;
	text: string | null;
};

export type FeedPostMedia = {
	mediaId: number;
	thumbnailUrl: string;
	fullImageUrl: string;
};

export async function getPosts(query: Parameters<typeof getRightNowFeedV4>[0]) {
	const response = await getRightNowFeedV4(query);

	const posts: FeedPost[] = [];

	for (const item of response.items) {
		if (item.type !== "right_now_post_v3" && item.type !== "locked_post_v1") {
			continue;
		}

		const post = item.data;
		posts.push({
			displayName: post.displayName ?? null,
			distance: post.distance ?? null,
			favorite: post.favorite,
			hosting: post.hosting,
			id: post.id,
			media: post.media.map((m) => ({
				mediaId: m.data.mediaId,
				thumbnailUrl: m.data.thumbnailUrl,
				fullImageUrl: m.data.fullImageUrl,
			})),
			mediaHash: post.mediaHash ?? null,
			onlineUntil: post.onlineUntil ?? null,
			posted: post.posted,
			profileId: post.profileId,
			recentlyChatted: post.recentlyChatted,
			text: post.text ?? null,
		});
	}

	return posts;
}
