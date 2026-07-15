<script lang="ts">
	import { env } from "$env/dynamic/public";
	import { untrack } from "svelte";
	import type { FeedPostMedia } from "$lib/right-now/posts";
	import RightNowAvatar from "./RightNowAvatar.svelte";
	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
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
		ref: HTMLImageElement | null;
		width: number | undefined;
		height: number | undefined;
		loaded: boolean;
	}

	let mediaStates = $state<ImageState[]>(
		untrack(() =>
			media.map(() => ({
				ref: null,
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
							ref: null,
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
</script>

<div class="flex w-full gap-4 text-gray-400">
	<div>
		<RightNowAvatar {profileId} {mediaHash} {onlineUntil} />
	</div>
	<div class="w-full">
		<div class={["mt-1 font-bold", { "text-white": text }]}>
			{text ? text : displayName ? `${displayName} joined` : "Joined"}
		</div>
		{#if media.length}
			<div class="align-items-start mt-2 flex flex-col items-start gap-1">
				{#each media as image, imgIndex}
					<a
						href={image.fullImageUrl}
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
							bind:this={mediaStates[imgIndex].ref}
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
				<ClockIcon class="inline-block size-4" />
				<RelativeTimeDynamic date={posted} />
				{#if distance}
					<NavigationArrowIcon class="inline-block size-4 -scale-x-100" />
					<DistanceFormatted {distance} />
				{/if}
				{#if hosting}
					<HouseIcon
						class="inline-block size-4 text-fuchsia-700"
						weight="fill"
					/>
				{/if}
			</div>
			<div>
				<a href="/chat/{conversationId}">
					<ChatIcon class="inline-block size-4 align-text-top" />
				</a>
			</div>
		</div>
	</div>
</div>
