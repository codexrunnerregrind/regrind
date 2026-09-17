<script lang="ts">
	import "photoswipe/style.css";
	import { goto } from "$app/navigation";
	import { env } from "$env/dynamic/public";
	import {
		ChatIcon,
		ClockIcon,
		HouseIcon,
		NavigationArrowIcon,
	} from "phosphor-svelte";
	import { untrack } from "svelte";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { sendTap } from "$lib/api/interest/taps";
	import { sendMessage } from "$lib/api/messaging/messages";
	import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
	import { downloadMedia } from "$lib/chat/lightbox-download";
	import {
		type MediaViewerActions,
		registerMediaViewerChrome,
	} from "$lib/chat/media-viewer-chrome";
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import { TapType } from "$lib/model/interest/taps";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
	import { profileMediaUrl } from "$lib/util/media";
	import { formatDistance } from "$lib/util/units";
	import type { FeedPostMedia } from "$lib/right-now/posts";
	import RightNowAvatar from "./RightNowAvatar.svelte";

	let {
		profileId,
		mediaHash = null,
		onlineUntil = null,
		text = null,
		displayName = null,
		media,
		posted,
		distance = null,
		hosting = false,
		ourProfileId,
	}: {
		profileId: number;
		mediaHash: string | null;
		onlineUntil: number | null;
		text: string | null;
		displayName: string | null;
		media: FeedPostMedia[];
		posted: number;
		distance: number | null;
		hosting: boolean;
		ourProfileId: number;
	} = $props();

	const conversationId = $derived(
		[profileId, ourProfileId].toSorted((a, b) => a - b).join(":"),
	);

	interface ImageState {
		width: number | undefined;
		height: number | undefined;
		loaded: boolean;
	}

	let mediaStates = $state<ImageState[]>(
		untrack(() =>
			media.map(() => ({
				width: undefined,
				height: undefined,
				loaded: false,
			})),
		),
	);

	$effect(() => {
		const targetLength = media.length;
		untrack(() => {
			if (mediaStates.length !== targetLength) {
				mediaStates = media.map((_, i) => {
					return (
						mediaStates[i] ?? {
							width: undefined,
							height: undefined,
							loaded: false,
						}
					);
				});
			}
		});
	});

	function markLoaded(img: HTMLImageElement, imgIndex: number) {
		const state = mediaStates[imgIndex];
		if (!state) return;
		state.loaded = true;
		state.width = img.naturalWidth;
		state.height = img.naturalHeight;
	}

	// When a post re-mounts on tab switch, an already-cached image is complete
	// immediately — mark it loaded before paint so we never flash the gray
	// placeholder for images the browser already has.
	function trackCached(node: HTMLImageElement, imgIndex: number) {
		if (node.complete && node.naturalWidth > 0) markLoaded(node, imgIndex);
	}

	// One lightbox per post, anchored to that post's own photos: a feed-wide
	// gallery would let you swipe from one person's photos straight into a
	// stranger's, which reads as a single set when it isn't.
	let mediaContainer = $state<HTMLElement | null>(null);
	let lightboxRef: PhotoSwipeLightbox | undefined;
	// A post is not a message, so a reply here starts an ordinary chat rather
	// than quoting anything; 🔥 is a Fire tap.
	const actions: MediaViewerActions = {
		onReply: async (text) => {
			await sendMessage({
				toUserId: profileId,
				message: { type: "Text", body: { text } },
			});
		},
		onReact: async () => {
			await sendTap({ recipientId: profileId, tapType: TapType.Hot });
		},
		onOpenChat: async () => {
			// Closing first: the lightbox is a body-level overlay, so it would sit
			// on top of the conversation we navigate to.
			lightboxRef?.pswp?.close();
			await goto(`/chat/${conversationId}`);
		},
		// In the chrome's sender row beside zoom and close, where the viewer's own
		// controls live — the toolbar that used to carry it is hidden.
		onSave: (index) => {
			const image = media[index];
			if (image) downloadMedia({ url: image.fullImageUrl, profileId });
		},
	};

	$effect(() => {
		if (!mediaContainer || media.length === 0) return;
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
					mainClass: `pswp--buttons-visible`,
					// Matches the chat and album viewers.
					bgOpacity: 1,
					counter: false,
				});
				const onBackGesture = () => {
					lightbox?.pswp?.close();
					return false;
				};
				lightbox.on("beforeOpen", () => {
					backGestureEventHandlers.add(onBackGesture);
				});
				lightbox.on("close", () => {
					backGestureEventHandlers.delete(onBackGesture);
				});
				registerMediaViewerChrome(lightbox, {
					count: media.length,
					header: {
						profileId,
						name: displayName,
						fallbackName: "Right Now",
						avatarUrl: mediaHash
							? profileMediaUrl({
									mediaHash: mediaHash,
									size: "thumb",
								})
							: null,
						// The feed reports metres, the viewer takes kilometres.
						distanceKm: distance === null ? null : distance / 1000,
					},
					actions,
				});
				lightboxRef = lightbox;
				lightbox.init();
			})
			.catch((error: unknown) => console.error(error));
		return () => {
			canceled = true;
			lightbox?.destroy();
			lightbox = undefined;
			lightboxRef = undefined;
		};
	});

	// Whitespace-only posts would render a blank first line and leave the row
	// a different height from its neighbours.
	const postText = $derived(text?.trim() ? text : null);

	const postAriaLabel = $derived.by(() => {
		let label = `Post by ${displayName ? displayName : "someone"}.`;
		if (postText !== null) {
			label += `With message.`;
		}
		if (distance !== null) {
			label += `Distance: ${formatDistance(distance, getUnitsSnapshot())}.`;
		}
		return label;
	});
</script>

<!-- Padding, gap and the inset divider mirror ProfileItem so this feed lines up
     with the inbox/taps lists (avatar at 16px, content and rule at 92px). -->
<article
	class="relative isolate flex w-full gap-3 py-3 ps-4 pe-4 text-sm text-muted-foreground after:pointer-events-none after:absolute after:right-4 after:bottom-0 after:left-list-inset after:border-b after:border-border/60"
	aria-label={postAriaLabel}
>
	<!-- Tapping anywhere in the row opens the poster's profile: the avatar alone
	     is a small target in a list you scan quickly. It's an overlay rather than
	     a wrapping anchor so the photos (lightbox) and the message button, both
	     lifted above it, keep their own actions. Hidden from assistive tech and
	     the tab order — the avatar link already carries the same destination. -->
	<a
		href="/profile/{profileId}"
		class="absolute inset-0"
		aria-hidden="true"
		tabindex="-1"
	></a>
	<div class="relative z-10">
		<RightNowAvatar {profileId} {displayName} {mediaHash} {onlineUntil} />
	</div>
	<div class="w-full">
		<div
			class={[
				"mt-1 leading-snug font-medium wrap-break-word",
				{ "text-foreground": postText !== null },
			]}
		>
			{postText ?? (displayName ? `${displayName} joined` : "Joined")}
		</div>
		{#if media.length}
			<div
				class="relative z-10 mt-2 flex flex-col items-start gap-1"
				bind:this={mediaContainer}
			>
				{#each media as image, imgIndex (image.fullImageUrl)}
					{@const state = mediaStates[imgIndex]}
					<a
						href={image.fullImageUrl}
						aria-label="Open image"
						data-pswp-width={state?.width}
						data-pswp-height={state?.height}
						class={[
							"pswp-trigger overflow-hidden",
							{
								"pointer-events-none w-full": !state?.loaded,
								"cursor-pointer": state?.loaded,
							},
						]}
					>
						{#if !state?.loaded}
							<div
								class="h-64 w-full animate-pulse rounded-lg bg-muted"
							></div>
						{/if}

						<img
							use:trackCached={imgIndex}
							onload={(e) =>
								markLoaded(
									e.currentTarget as HTMLImageElement,
									imgIndex,
								)}
							src={image.fullImageUrl}
							alt=""
							class={[
								"max-h-64 w-full rounded-lg object-contain transition-opacity duration-300",
								{
									"opacity-0": !state?.loaded,
									"opacity-100": state?.loaded,
									"blur-2xl": env.PUBLIC_ENABLE_BLUR_EFFECTS,
								},
							]}
						/>
					</a>
				{/each}
			</div>
		{/if}
		<div class="mt-2 flex justify-between">
			<div class="flex items-center gap-2">
				<ClockIcon class="inline-block size-4" aria-hidden="true" />
				<span class="sr-only">Posted:</span>
				<RelativeTimeDynamic date={posted} />
				{#if distance !== null}
					<NavigationArrowIcon
						class="inline-block size-4 -scale-x-100"
						aria-hidden="true"
					/>
					<span class="sr-only">Distance:</span>
					<DistanceFormatted {distance} />
				{/if}
				{#if hosting}
					<HouseIcon
						class="inline-block size-4 text-fuchsia-700"
						weight="fill"
						aria-hidden="true"
					/>
					<span class="sr-only">Hosting</span>
				{/if}
			</div>
			<div class="relative z-10">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					href="/chat/{conversationId}"
					aria-label="Message {displayName
						? `${displayName}`
						: 'someone'}"
				>
					<ChatIcon
						class="inline-block size-4 align-text-top"
						aria-hidden="true"
					/>
				</Button>
			</div>
		</div>
	</div>
</article>
