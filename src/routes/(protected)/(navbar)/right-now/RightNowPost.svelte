<script lang="ts">
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
		onImageClick,
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
		onImageClick: (url: string) => void;
	} = $props();

	const conversationId = $derived(
		[profileId, ourProfileId].toSorted((a, b) => a - b).join(":"),
	);
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
			<div class="mt-2">
				{#each media as image}
					<button onclick={() => onImageClick(image.fullImageUrl)}>
						<img src={image.thumbnailUrl} alt="" class="rounded-lg" />
					</button>
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
					<ChatIcon class="inline-block size-4" />
				</a>
			</div>
		</div>
	</div>
</div>
