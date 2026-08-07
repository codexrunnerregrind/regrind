<script lang="ts">
	import "photoswipe/style.css";
	import { goto } from "$app/navigation";
	import { format } from "date-fns";
	import { UserIcon } from "phosphor-svelte";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { sendTap } from "$lib/api/interest/taps";
	import { sendMessage } from "$lib/api/messaging/messages";
	import { downloadMedia } from "$lib/chat/lightbox-download";
	import {
		type MediaViewerActions,
		registerMediaViewerChrome,
	} from "$lib/chat/media-viewer-chrome";
	import { TapType } from "$lib/model/interest/taps";
	import { profileMediaUrl } from "$lib/util/media";
	import {
		applyPhotoSwipeBackGesture,
		applyPhotoSwipeErrorUi,
		applyPhotoSwipeThumbDimensions,
	} from "$lib/util/photoswipe";
	import ImageCarouselItem from "./ImageCarouselItem.svelte";

	let {
		medias,
		profileId,
		ourProfileId,
		displayName = null,
		self = false,
	}: {
		medias: {
			mediaHash: string;
			takenOnGrindr: boolean | null;
			createdAt: number | null;
		}[];
		profileId: number;
		ourProfileId: number;
		displayName?: string | null;
		/** Our own profile: nobody to reply to or tap. */
		self?: boolean;
	} = $props();

	const conversationId = $derived(
		[profileId, ourProfileId].toSorted((a, b) => a - b).join(":"),
	);

	function dateLabel(index: number): string | null {
		const createdAt = medias[index]?.createdAt;
		return createdAt === null || createdAt === undefined
			? null
			: format(createdAt, "dd MMMM yyyy");
	}

	// A reply to a profile photo is its own message type, quoting the photo by
	// hash; 🔥 is the profile-level Fire tap rather than a message reaction.
	const profileActions = {
		onReply: async (text: string, index: number) => {
			const media = medias[index];
			if (!media) return;
			await sendMessage({
				toUserId: profileId,
				message: {
					type: "ProfilePhotoReply",
					body: { imageHash: media.mediaHash, photoContentReply: text },
				},
			});
		},
		onReact: async () => {
			await sendTap({ recipientId: profileId, tapType: TapType.Hot });
		},
		onOpenChat: async () => {
			// Closing first: the lightbox is a body-level overlay, so it would sit
			// on top of the conversation we're navigating to.
			lightboxRef?.pswp?.close();
			await goto(`/chat/${conversationId}`);
		},
	};

	let lightboxRef: PhotoSwipeLightbox | undefined = $state();

	let gallery: HTMLDivElement | null = $state(null);

	$effect(() => {
		if (!gallery) return;
		// Built here rather than up front so `self` is read when the viewer opens.
		// Saving is offered either way — it is one of the viewer's own controls,
		// alongside zoom and close, not something you do to somebody else's photo.
		const actions: MediaViewerActions = {
			...(self ? {} : profileActions),
			onSave: (index) => {
				const media = medias[index];
				if (!media) return;
				downloadMedia({
					url: profileMediaUrl({ mediaHash: media.mediaHash, size: "full" }),
				});
			},
		};
		let lightbox: PhotoSwipeLightbox | undefined;
		import("photoswipe/lightbox")
			.then(({ default: PhotoSwipeLightbox }) => {
				if (!gallery) return;
				lightbox = new PhotoSwipeLightbox({
					gallery,
					children: ".item[href]",
					pswpModule: () => import("photoswipe"),
					mainClass: `pswp--buttons-visible`,
					// Matches the chat and album viewers: opaque backdrop, no counter
					// (the chrome's segments say where we are) and the photo filling the
					// screen under the chrome's floating bars.
					bgOpacity: 1,
					counter: false,
				});
				applyPhotoSwipeErrorUi(lightbox);
				applyPhotoSwipeThumbDimensions(lightbox);
				applyPhotoSwipeBackGesture(lightbox);
				lightbox.on("openingAnimationStart", () => {
					gallery?.querySelectorAll(".item").forEach((item) => {
						if (item instanceof HTMLElement) {
							item.style.visibility = "hidden";
						}
					});
				});
				lightbox.on("change", () => {
					gallery?.scrollTo({
						top: lightbox?.pswp?.currSlide?.data.element?.offsetTop ?? 0,
						behavior: "instant",
					});
				});
				lightbox.on("destroy", () => {
					gallery?.querySelectorAll(".item").forEach((item) => {
						if (item instanceof HTMLElement) {
							item.style.visibility = "visible";
						}
					});
				});
				// No toolbar download button: the chrome hides the toolbar and carries
				// saving in its sender row (see `actions.onSave` above).
				registerMediaViewerChrome(lightbox, {
					count: medias.length,
					// The date each photo was taken replaces the old bottom label, which
					// the reply bar now occupies.
					header: (index) => ({
						fallbackName: displayName?.trim() || "Photos",
						subtitle: dateLabel(index),
						// Their primary photo, which is the avatar everywhere else. No
						// profileId: this viewer opens from that profile already, so
						// there is nowhere for the header to link to.
						avatarUrl: medias[0]
							? profileMediaUrl({
									mediaHash: medias[0].mediaHash,
									size: "thumb",
								})
							: null,
					}),
					actions,
				});

				lightboxRef = lightbox;
				lightbox.init();
			})
			.catch((error) => console.error(error));
		return () => lightbox?.destroy();
	});

	const GAP = 4; //px
	const PADDING_VERTICAL = 8; //px
	const PADDING_HORIZONTAL = PADDING_VERTICAL;
	const BULLET_SIZE = 8; //px

	let indicatorY = $state(PADDING_VERTICAL);
	let indicatorHeight = $state(BULLET_SIZE);
</script>

<div class="relative aspect-3/4 h-auto max-h-photo w-full">
	{#if medias.length}
		<div
			class="carousel relative flex size-full max-h-[inherit] snap-y snap-mandatory flex-col overflow-auto *:snap-center"
			bind:this={gallery}
			onscroll={() => {
				if (!gallery) return;
				const item = gallery.scrollTop / gallery.clientHeight;
				const frac = item % 1;
				const stretch = Math.min(frac, 1 - frac);
				const index = Math.floor(item);
				const tipYp =
					Math.min(item > 0 ? index : item, medias.length - 1) +
					(item < medias.length - 1 ? Math.max(0, (frac - 0.5) * 2) : frac);
				indicatorY = PADDING_VERTICAL + tipYp * (BULLET_SIZE + GAP);
				const indicatorStretch = stretch * (BULLET_SIZE * 2 + GAP + 4);
				indicatorHeight =
					BULLET_SIZE +
					(item > 0 && item < medias.length - 1 ? indicatorStretch : 0);
			}}
		>
			{#each medias as { mediaHash, createdAt }, index}
				{@const src = profileMediaUrl({ mediaHash, size: "full" })}
				<ImageCarouselItem
					{src}
					thumb={src}
					{createdAt}
					label="Profile photo {index + 1} of {medias.length}"
				/>
			{/each}
		</div>
		<div
			class="absolute top-1/2 right-2 flex -translate-y-1/2 flex-col rounded-full bg-background/30 p-2 backdrop-blur-sm"
			style:gap="{GAP}px"
			style:padding="{PADDING_VERTICAL}px {PADDING_HORIZONTAL}px"
		>
			{#each medias, i (i)}
				<span class="block size-2 rounded-full bg-neutral-200/40"></span>
			{/each}
			<span
				class="absolute left-2 block w-2 rounded-full bg-neutral-300"
				style:top="{indicatorY}px"
				style:height="{indicatorHeight}px"
			></span>
		</div>
	{:else}
		<div class="absolute size-full bg-media-placeholder">
			<UserIcon
				weight="fill"
				color="var(--color-stone-400)"
				class="absolute top-1/2 left-1/2 size-3/4 -translate-1/2"
			/>
		</div>
	{/if}
</div>

<style lang="postcss">
	@reference "$layout";
	.carousel::-webkit-scrollbar {
		display: none;
	}
	/* The former `pswp--close-only` rules are gone with them: this viewer now
	   keeps the download and zoom buttons, and the date it used to print along
	   the bottom edge moved into the chrome's header, which the reply bar would
	   otherwise sit on top of. */
</style>
