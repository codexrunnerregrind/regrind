<script lang="ts">
	import "photoswipe/style.css";
	import { env } from "$env/dynamic/public";
	import LightningIcon from "phosphor-svelte/lib/LightningIcon";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { downloadMedia } from "$lib/chat/lightbox-download";
	import { registerMediaViewerChrome } from "$lib/chat/media-viewer-chrome";
	import * as Card from "$lib/components/ui/card";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";

	let {
		text,
		thumbnailUrl = null,
		fullImageUrl = null,
		profileId,
		displayName = null,
		self = false,
	}: {
		text: string | null;
		thumbnailUrl?: string | null;
		fullImageUrl?: string | null;
		profileId: number;
		displayName?: string | null;
		self?: boolean;
	} = $props();

	const said = $derived(text !== null && text.trim() !== "");
	// A post with only a photo still gets the card. The card draws the full-size
	// image rather than the thumbnail: it has to be fetched anyway to measure it
	// for the viewer, and drawing the same pixels the viewer opens is what keeps
	// the morph from showing a different crop halfway through.
	const photo = $derived(fullImageUrl ?? thumbnailUrl);

	let width = $state<number | undefined>(undefined);
	let height = $state<number | undefined>(undefined);
	let loaded = $state(false);

	function markLoaded(img: HTMLImageElement) {
		loaded = true;
		width = img.naturalWidth;
		height = img.naturalHeight;
	}

	// PhotoSwipe needs the real dimensions of the image it will open, and the
	// thumbnail's are not those — measure the full-size one off-screen.
	function measure(url: string) {
		const img = new Image();
		img.onload = () => markLoaded(img);
		img.src = url;
	}

	$effect(() => {
		if (photo === null) return;
		loaded = false;
		measure(photo);
	});

	/** Longest side of the thumbnail, in px. */
	const THUMB_BOX = 160;

	// The thumbnail wears the full image's own proportions, fitted into a
	// 160px box — big enough to make out, short of the full-width panel that
	// read as a second carousel. Its own proportions and not a square: the
	// viewer morphs the thumbnail's rectangle into the full image's, and a
	// square one of a landscape photo made that animation flick.
	const thumb = $derived.by(() => {
		if (!width || !height) return { w: THUMB_BOX, h: THUMB_BOX };
		const scale = THUMB_BOX / Math.max(width, height);
		return { w: Math.round(width * scale), h: Math.round(height * scale) };
	});

	let mediaContainer = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!mediaContainer || photo === null) return;
		const gallery = mediaContainer;
		let lightbox: PhotoSwipeLightbox | undefined;
		let canceled = false;
		void import("photoswipe/lightbox")
			.then(({ default: PhotoSwipeLightboxCtor }) => {
				if (canceled) return;
				lightbox = new PhotoSwipeLightboxCtor({
					gallery,
					children: "a.pswp-trigger",
					pswpModule: () => import("photoswipe"),
					mainClass: "pswp--buttons-visible",
					// Matches the chat, album and Right Now feed viewers.
					bgOpacity: 1,
					counter: false,
				});
				const onBackGesture = () => {
					lightbox?.pswp?.close();
					return false;
				};
				lightbox.on("beforeOpen", () => {
					backGestureEventHandlers.set(onBackGesture, "overlay");
				});
				lightbox.on("close", () => {
					backGestureEventHandlers.delete(onBackGesture);
				});
				registerMediaViewerChrome(lightbox, {
					count: 1,
					header: {
						// Our own photo has nowhere to link to.
						profileId: self ? null : profileId,
						name: displayName,
						fallbackName: "Right Now",
					},
					progress: false,
					actions: {
						onSave: () => downloadMedia({ url: photo, profileId }),
					},
				});
				lightbox.init();
			})
			.catch((error: unknown) => console.error(error));
		return () => {
			canceled = true;
			lightbox?.destroy();
			lightbox = undefined;
		};
	});
</script>

<!-- Marked as a Right Now post rather than left to look like the bio further
     down: the bolt is the glyph the Right Now tab already wears, the fuchsia is
     the color the indicator beside the online status and the grid tiles use. The
     words "Right Now" are not repeated — the row above says them already, an inch
     away.

     What they said and what they showed, and only that: whether they are up for
     something is carried next to the online status by RightNowStatus.svelte
     rather than in here. -->
{#if said || photo !== null}
	<Card.Root class="mt-4 rounded-xl bg-fuchsia-600/5">
		<Card.Content class="flex items-start gap-2.5">
			<LightningIcon
				weight="fill"
				class="mt-0.5 size-4 shrink-0 text-fuchsia-600"
				aria-hidden="true"
			/>
			<div class="flex min-w-0 flex-col gap-2.5">
				{#if said}
					<p
						class="text-pretty wrap-break-word whitespace-pre-wrap select-text"
					>
						{text}
					</p>
				{/if}
				{#if photo !== null}
					<div bind:this={mediaContainer}>
						<a
							href={photo}
							aria-label="Open photo"
							data-pswp-width={width}
							data-pswp-height={height}
							style:width="{thumb.w}px"
							style:height="{thumb.h}px"
							class={[
								"pswp-trigger block overflow-hidden rounded-lg bg-muted",
								{
									"pointer-events-none": !loaded,
									"cursor-pointer": loaded,
								},
							]}
						>
							<img
								src={photo}
								alt=""
								class={[
									"size-full object-cover transition-opacity duration-200",
									{
										"opacity-100": loaded,
										"opacity-0": !loaded,
										"blur-2xl":
											env.PUBLIC_ENABLE_BLUR_EFFECTS,
									},
								]}
							/>
						</a>
					</div>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>
{/if}
