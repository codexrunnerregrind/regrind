<script lang="ts">
	import { afterNavigate, beforeNavigate } from "$app/navigation";

	import ZoomableImage from "./ZoomableImage.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import * as Avatar from "$lib/components/ui/avatar";
	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import {
		ClockIcon,
		NavigationArrowIcon,
		HouseIcon,
		ChatIcon,
	} from "phosphor-svelte";

	let {
		ourProfileId,
	}: {
		ourProfileId: number;
	} = $props();

	$effect.pre(() => {
		rightNowState.load();
	});

	export function refresh() {
		rightNowState.refresh();
	}

	beforeNavigate(() => {
		rightNowState.scrollY = window.scrollY;
	});

	afterNavigate((navigation) => {
		if (navigation.type === "popstate") return;
		if (!rightNowState.loading) {
			window.scrollTo({ top: rightNowState.scrollY, behavior: "instant" });
		}
	});

	let scrolled = $state(false);
	$effect(() => {
		if (!scrolled && !rightNowState.loading) {
			scrolled = true;
			window.scrollTo({ top: rightNowState.scrollY, behavior: "instant" });
		}
	});

	let lightboxOpen = $state(false);
	let activeImageUrl = $state("");

	function openImage(url: string) {
		activeImageUrl = url;
		lightboxOpen = true;
	}
</script>

<div class="flex max-w-5xl flex-col gap-6 px-8">
	{#if rightNowState.loading}
		<div>TODO: Loading SKeleton</div>
	{:else if rightNowState.error}
		<div class="col-span-full flex p-4">
			<ApiErrorDisplay
				error={rightNowState.error}
				onRetry={() => rightNowState.refresh()}
				class="m-auto"
			/>
		</div>
	{:else}
		{#each rightNowState.posts as post}
			<div class="flex w-full gap-4 text-gray-400">
				<a href="/profile/{post.profileId}">
					<Avatar.Root class="size-20">
						<UserAvatar
							mediaHash={post.mediaHash}
							class="size-20 rounded-full bg-neutral-700 *:rounded-full"
						/>
						<!-- TODO: ONLINE INDICATOR -->
					</Avatar.Root>
				</a>
				<div class="w-full">
					<div class={["mt-1 font-bold", { "text-white": post.text }]}>
						{post.text
							? post.text
							: post.displayName
								? `${post.displayName} joined`
								: "Joined"}
					</div>
					{#if post.media.length}
						<div class="mt-2">
							{#each post.media as image}
								<button onclick={() => openImage(image.fullImageUrl)}>
									<img src={image.thumbnailUrl} alt="" class="rounded-lg" />
								</button>
							{/each}
						</div>
					{/if}
					<div class="mt-2 flex justify-between">
						<div class="flex items-center gap-2">
							<ClockIcon class="inline-block size-4" />
							<RelativeTimeDynamic date={post.posted} />
							{#if post.distance}
								<NavigationArrowIcon class="inline-block size-4 -scale-x-100" />
								<DistanceFormatted distance={post.distance} />
							{/if}
							{#if post.hosting}
								<HouseIcon
									class="inline-block size-4 text-fuchsia-700"
									weight="fill"
								/>
							{/if}
						</div>
						<div>
							<a
								href="/chat/{[post.profileId, ourProfileId]
									.toSorted((a, b) => a - b)
									.join(':')}"
							>
								<ChatIcon class="inline-block size-4" />
							</a>
						</div>
					</div>
				</div>
			</div>
		{/each}
	{/if}
</div>

<ZoomableImage bind:open={lightboxOpen} src={activeImageUrl} />
