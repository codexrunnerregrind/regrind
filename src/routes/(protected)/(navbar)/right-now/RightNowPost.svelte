<script lang="ts">
	import { env } from "$env/dynamic/public";
	import { untrack } from "svelte";
	import type { FeedPostMedia } from "$lib/right-now/posts";
	import RightNowAvatar from "./RightNowAvatar.svelte";
	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import { formatDistance } from "$lib/util/units";
	import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
	import {
		ClockIcon,
		NavigationArrowIcon,
		HouseIcon,
		ChatIcon,
	} from "phosphor-svelte";

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
		mediaStates[imgIndex].loaded = true;
		mediaStates[imgIndex].width = img.naturalWidth;
		mediaStates[imgIndex].height = img.naturalHeight;
	}

	// When a post re-mounts on tab switch, an already-cached image is complete
	// immediately — mark it loaded before paint so we never flash the grey
	// placeholder for images the browser already has.
	function trackCached(node: HTMLImageElement, imgIndex: number) {
		if (node.complete && node.naturalWidth > 0) markLoaded(node, imgIndex);
	}

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
	class="relative flex w-full gap-3 py-3 ps-4 pe-4 text-sm text-muted-foreground after:pointer-events-none after:absolute after:right-4 after:bottom-0 after:left-list-inset after:border-b after:border-border/60"
	aria-label={postAriaLabel}
>
	<div>
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
			<div class="mt-2 flex flex-col items-start gap-1">
				{#each media as image, imgIndex (image.fullImageUrl)}
					<a
						href={image.fullImageUrl}
						aria-label="Open image"
						data-pswp-width={mediaStates[imgIndex].width}
						data-pswp-height={mediaStates[imgIndex].height}
						class={[
							"pswp-trigger overflow-hidden",
							{
								"pointer-events-none w-full": !mediaStates[imgIndex].loaded,
								"cursor-pointer": mediaStates[imgIndex].loaded,
							},
						]}
					>
						{#if !mediaStates[imgIndex].loaded}
							<div class="h-64 w-full animate-pulse rounded-lg bg-muted"></div>
						{/if}

						<img
							use:trackCached={imgIndex}
							onload={(e) =>
								markLoaded(e.currentTarget as HTMLImageElement, imgIndex)}
							src={image.fullImageUrl}
							alt=""
							class={[
								"max-h-64 w-full rounded-lg object-contain transition-opacity duration-300",
								{
									"opacity-0": !mediaStates[imgIndex].loaded,
									"opacity-100": mediaStates[imgIndex].loaded,
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
			<div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					href="/chat/{conversationId}"
					aria-label="Message {displayName ? `${displayName}` : 'someone'}"
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
