import { mount, unmount } from "svelte";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import MediaViewerChrome from "$lib/components/media/MediaViewerChrome.svelte";

/**
 * Who the media belongs to, for the viewer's header. Given a `profileId` the
 * header resolves their real name, avatar and distance itself and becomes a way
 * into their profile; the other fields are what it shows in the meantime.
 */
export type MediaViewerHeader = {
	/** Whose media this is. Omit for our own, which has nowhere to link to. */
	profileId?: number | null;
	name?: string | null;
	avatarUrl?: string | null;
	/** Kilometres, as the shares feed reports it. Hidden when absent. */
	distanceKm?: number | null;
	/** Second line when there's no distance to show; falls back to a count. */
	subtitle?: string | null;
	/** Shown when `name` is empty — an album's name, say. */
	fallbackName: string;
};

/**
 * What the viewer's own controls can do. Each handler is optional and its
 * control only renders when provided, so a viewer with none of them gets a
 * header alone. `index` is the slide the viewer is on when the control is used.
 */
export type MediaViewerActions = {
	onReply?: (text: string, index: number) => Promise<void>;
	onReact?: (index: number) => Promise<void>;
	onOpenChat?: () => void | Promise<void>;
	/**
	 * Save the current slide to the device. Sits in the sender row rather than
	 * the reply bar, beside zoom and close, and so does not imply a bar.
	 */
	onSave?: (index: number) => void | Promise<void>;
};

export function chromeHasBar(actions: MediaViewerActions): boolean {
	return (
		actions.onReply !== undefined ||
		actions.onReact !== undefined ||
		actions.onOpenChat !== undefined
	);
}

export type MediaViewerChromeOptions = {
	count: number;
	/**
	 * Pass a function when the slides belong to different people — the Right Now
	 * feed spans every poster's photos, so its header changes with the slide.
	 */
	header: MediaViewerHeader | ((index: number) => MediaViewerHeader);
	actions: MediaViewerActions;
	/**
	 * Whether to show where you are in the set. Off for galleries whose slides
	 * aren't really one set — the Right Now feed strings together every poster's
	 * photos, so a position among them means nothing. Defaults to on.
	 */
	progress?: boolean;
};

/**
 * Mounts the story-style chrome — progress, whose media this is, zoom/save/close
 * and the reply bar — into a PhotoSwipe lightbox. Shared by the album viewer and
 * the conversation image gallery.
 *
 * The bars float over the media rather than displacing it: the photo fills the
 * screen, and the bars lean on a scrim and a text shadow to stay legible over
 * it. It also marks the root `pswp--chrome`, which is what hides PhotoSwipe's
 * own toolbar (the sender row carries those three actions) and sets the
 * viewer's palette.
 */
export function registerMediaViewerChrome(
	lightbox: PhotoSwipeLightbox,
	{ count, header, actions, progress = true }: MediaViewerChromeOptions,
): void {
	// Mounted inside the lightbox's own root so it shares its stacking context
	// and its open/close animation, and goes away with it.
	let chrome: Record<string, unknown> | null = null;
	lightbox.on("firstUpdate", () => {
		const { pswp } = lightbox;
		if (!pswp?.element) return;
		pswp.element.classList.add("pswp--chrome");
		chrome = mount(MediaViewerChrome, {
			target: pswp.element,
			props: { pswp, count, header, actions, progress },
		});
	});
	// Typing in the reply field would otherwise flip between slides (arrows) or
	// close the viewer (Escape); Escape gives the field up instead.
	lightbox.on("keydown", (event) => {
		const { target, key } = event.originalEvent;
		if (!(target instanceof HTMLElement)) return;
		if (!target.closest("[data-media-chrome]")) return;
		event.preventDefault();
		if (key === "Escape") target.blur();
	});
	lightbox.on("destroy", () => {
		if (chrome === null) return;
		void unmount(chrome, { outro: false });
		chrome = null;
	});
}
