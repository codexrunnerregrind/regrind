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

	function handleLoad(event: Event, imgIndex: number) {
		const img = event.currentTarget as HTMLImageElement;
		mediaStates[imgIndex].loaded = true;
		mediaStates[imgIndex].width = img.naturalWidth;
		mediaStates[imgIndex].height = img.naturalHeight;
	}

	const postAriaLabel = $derived.by(() => {
		let label = `Post by ${displayName ? displayName : "someone"}.`;
		if (text !== null) {
			label += `With message.`;
		}
		if (distance !== null) {
			label += `Distance: ${formatDistance(distance, getUnitsSnapshot())}.`;
		}
		return label;
	});
</script>

<article class="flex w-full gap-4 text-gray-400" aria-label={postAriaLabel}>
	<div>
		<RightNowAvatar {profileId} {displayName} {mediaHash} {onlineUntil} />
	</div>
	<div class="w-full">
		<div class={["mt-1 font-bold wrap-break-word", { "text-white": text }]}>
			{text ? text : displayName ? `${displayName} joined` : "Joined"}
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
							<div
								class="h-64 w-full animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800"
							></div>
						{/if}

						<img
							onload={(e) => handleLoad(e, imgIndex)}
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
