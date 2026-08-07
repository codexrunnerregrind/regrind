import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import { getConversation } from "../messages";

export type ReceivedPhoto = {
	url: string;
	width: number;
	height: number;
	/**
	 * The message the photo arrived in, so the viewer can reply to and react to
	 * the right one. Kept whole because photos scanned out of deep history are
	 * not in the chat's own message list for a lookup by id.
	 */
	message: ApiResponseMessage;
};

function toPhotos({
	messages,
	profileId,
}: {
	messages: ApiResponseMessage[];
	profileId: number;
}): ReceivedPhoto[] {
	return messages
		.filter((m) => m.type === "Image" && m.senderId === profileId)
		.map((m) => {
			const body = m.body as {
				url: string;
				width: number;
				height: number;
			};
			return {
				url: body.url,
				width: body.width,
				height: body.height,
				message: m,
			};
		});
}

// Walks the conversation history newest-first and keeps only the image bodies,
// so the gallery covers photos the user hasn't scrolled back to without pulling
// the whole history into the chat's message list.
export async function collectReceivedPhotos({
	conversationId,
	profileId,
	loaded,
	pageKey,
}: {
	conversationId: string;
	profileId: number;
	// Messages the chat already has, so the first pages aren't refetched.
	loaded: ApiResponseMessage[];
	// Where the chat's own pagination left off; null when it reached the end.
	pageKey: string | null;
}): Promise<ReceivedPhoto[]> {
	const photos = toPhotos({ messages: loaded, profileId });
	const seen = new Set(photos.map((p) => p.url));

	let next = pageKey;
	while (next !== null) {
		const page = await getConversation({ conversationId, pageKey: next });
		for (const photo of toPhotos({ messages: page.messages, profileId })) {
			if (seen.has(photo.url)) continue;
			seen.add(photo.url);
			photos.push(photo);
		}
		next = page.pageKey;
	}

	// Oldest-first, to match the chat order.
	return photos.reverse();
}
