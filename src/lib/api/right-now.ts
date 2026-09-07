import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { fetchRest } from "$lib/api/transport";
import { demoEnabled, demoUploadRightNowMedia } from "$lib/demo";
import { rightNowV4QuerySchema } from "$lib/model/right-now/feed/query/v4";
import { RightNowFeedResponseSchema } from "$lib/model/right-now/feed/response/v4";
import {
	type RightNowCreatePost,
	type RightNowMediaUpload,
	rightNowMediaUploadSchema,
	type RightNowOwnPost,
	rightNowOwnPostSchema,
	type RightNowUpdatePost,
} from "$lib/model/right-now/post";
import { toBase64 } from "$lib/util/base64";
import { urlSearchParamsCodec } from "$lib/util/url-search-params";

export async function getRightNowFeedV4(
	query: z.infer<typeof rightNowV4QuerySchema>,
) {
	return await fetchRest(
		"/v4/rightnow/feed?" +
			new URLSearchParams(
				urlSearchParamsCodec(rightNowV4QuerySchema).encode(query),
			).toString(),
	).then((res) => res.jsonParsed(RightNowFeedResponseSchema));
}

const entitlementsResponseSchema = z.looseObject({
	/** How many Right Now posts the account may have running. Zero means none. */
	rightNow: z.coerce.number().int().nonnegative().catch(0),
});

export async function getEntitlements() {
	return await fetchRest("/v1/entitlements").then((res) =>
		res.jsonParsed(entitlementsResponseSchema),
	);
}

/**
 * Reads our own post out of a response that has been seen both ways round: the
 * post wrapped in `post`, and the post on its own. Deliberately tolerant —
 * failing to recognise a post reads as "nothing posted", which would leave a
 * running post with nothing on screen to end it with.
 */
function ownPostFrom(payload: unknown): RightNowOwnPost | null {
	const wrapped = z
		.looseObject({ post: rightNowOwnPostSchema.nullish() })
		.safeParse(payload);
	if (wrapped.success && wrapped.data.post) return wrapped.data.post;
	const bare = rightNowOwnPostSchema.safeParse(payload);
	return bare.success ? bare.data : null;
}

/**
 * The post we currently have up, or null when there is none. An account with
 * nothing posted answers 404 rather than an empty body, so that is not an error
 * here either.
 */
export async function getActiveRightNowPost(): Promise<RightNowOwnPost | null> {
	const res = await fetchRest("/v3/rightnow/active-post");
	if (res.status === 404) return null;
	res.assertOk();
	return ownPostFrom(res.json());
}

export async function createRightNowPost(
	post: RightNowCreatePost,
): Promise<RightNowOwnPost | null> {
	return await fetchRest("/v3/rightnow/posts", {
		method: "POST",
		body: post,
	}).then((res) => {
		res.assertOk();
		return ownPostFrom(res.json());
	});
}

export async function updateRightNowPost({
	postId,
	patch,
}: {
	postId: number;
	patch: RightNowUpdatePost;
}): Promise<void> {
	// `sharedFields` rides along on every patch: the API reads it as the whole
	// list rather than a change to it, and an empty one is what we ever send.
	await fetchRest(`/v3/rightnow/posts/${postId}`, {
		method: "PATCH",
		body: { ...patch, sharedFields: [] },
	}).then((res) => res.assertOk());
}

/**
 * Uploads a photo for a post. Its own endpoint, and its own response — the feed
 * renders the thumbnail this hands back rather than a media hash.
 */
export async function uploadRightNowMedia({
	bytes,
	contentType,
}: {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
}): Promise<RightNowMediaUpload> {
	if (demoEnabled) {
		return demoUploadRightNowMedia({ bytes, contentType });
	}
	const response = await invoke("upload_right_now_media", {
		contentType,
		data: toBase64(bytes),
	});
	return rightNowMediaUploadSchema.parse(response);
}
