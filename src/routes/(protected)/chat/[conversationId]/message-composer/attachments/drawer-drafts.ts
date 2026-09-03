import type { DrawerMedia } from "$lib/api/messaging/drawer";
import type { MessageDraft } from "$lib/model/messaging/messages";

export function isVideo(item: DrawerMedia): boolean {
	return item.contentType.startsWith("video/");
}

/**
 * How many times the recipient may open a clip. The unlimited count is not a
 * count at all — it is `NonExpiringVideo`, a message type of its own — and two
 * is what the API's own clips come with, which is what a replayable one gets
 * here.
 */
export const VIDEO_VIEWS = {
	once: 1,
	repeat: 2,
	unlimited: 2147483647,
} as const;

export type VideoViews = keyof typeof VIDEO_VIEWS;

export const VIDEO_VIEW_OPTIONS: { value: VideoViews; label: string }[] = [
	{ value: "unlimited", label: "Unlimited" },
	{ value: "once", label: "Once" },
	{ value: "repeat", label: "Repeat" },
];

export function videoDraft(item: DrawerMedia, views: VideoViews): MessageDraft {
	const maxViews = VIDEO_VIEWS[views];
	const body = { mediaId: item.id, looping: false, maxViews };
	const preview = {
		...body,
		url: item.url,
		contentType: item.contentType,
		// The drawer does not report a clip's length, and nothing on screen needs
		// one before the sent message comes back carrying it.
		length: 0,
		viewsRemaining: maxViews,
	};
	return views === "unlimited"
		? {
				outbound: { type: "NonExpiringVideo", body },
				optimistic: { type: "NonExpiringVideo", body: preview },
			}
		: {
				outbound: { type: "Video", body },
				optimistic: { type: "Video", body: preview },
			};
}

function imageHashFromUrl(url: string): string {
	return /([0-9a-f]{64}|[0-9a-f]{40})/i.exec(url)?.[1] ?? "";
}

export function imageDraft(item: DrawerMedia, expiring: boolean): MessageDraft {
	const mediaBody = {
		mediaId: item.id,
		width: null,
		height: null,
		url: item.url,
	};
	return expiring
		? {
				outbound: {
					type: "ExpiringImage",
					body: { mediaId: item.id, expiring: true },
				},
				optimistic: { type: "ExpiringImage", body: mediaBody },
			}
		: {
				outbound: { type: "Image", body: { mediaId: item.id } },
				optimistic: {
					type: "Image",
					body: {
						...mediaBody,
						imageHash: imageHashFromUrl(item.url),
						takenOnGrindr: item.takenOnGrindr,
						createdAt: item.createdTs,
					},
				},
			};
}

/** The sheet's expiry control for a clip: how many times it may be watched. */
export function videoViewsControl(
	selected: VideoViews,
	select: (value: VideoViews) => void,
) {
	return {
		title: "Recipient can watch…",
		label:
			VIDEO_VIEW_OPTIONS.find(({ value }) => value === selected)?.label ??
			"Once",
		selected,
		options: VIDEO_VIEW_OPTIONS,
		select,
	};
}
