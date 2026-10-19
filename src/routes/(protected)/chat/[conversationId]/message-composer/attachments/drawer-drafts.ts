import type { DrawerMedia } from "$lib/api/messaging/drawer";
import type { MessageDraft } from "$lib/model/messaging/messages";
import type {
	MediaFileInspection,
	MediaPreview,
} from "$lib/platform/media-file";

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

// Pasted or dropped media, sent before its upload has finished.
export function sendNowDraft({
	inspection,
	preview,
	upload,
}: {
	inspection: MediaFileInspection & { kind: "photo" | "video" };
	preview: MediaPreview | null;
	upload: () => Promise<number>;
}): MessageDraft {
	if (inspection.kind === "video") {
		return {
			outbound: async () => ({
				type: "Video",
				body: {
					mediaId: await upload(),
					looping: false,
					maxViews: VIDEO_VIEWS.repeat,
				},
			}),
			optimistic: {
				type: "Video",
				body: {
					mediaId: 0,
					url: "",
					contentType: "video/mp4",
					length: inspection.durationMs ?? 0,
					maxViews: VIDEO_VIEWS.repeat,
					viewsRemaining: VIDEO_VIEWS.repeat,
					looping: false,
				},
			},
		};
	}
	return {
		outbound: async () => ({
			type: "Image",
			body: { mediaId: await upload() },
		}),
		optimistic: {
			type: "Image",
			body: {
				mediaId: 0,
				url: preview?.dataUrl ?? "",
				width: preview?.width ?? null,
				height: preview?.height ?? null,
				imageHash: "",
				takenOnGrindr: false,
				createdAt: Date.now(),
			},
		},
	};
}
