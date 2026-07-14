<script lang="ts">
	import { afterNavigate, beforeNavigate } from "$app/navigation";

	import ZoomableImage from "./ZoomableImage.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import RightNowPost from "./RightNowPost.svelte";
	import RightNowEmptyFeed from "./RightNowEmptyFeed.svelte";

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

	let isImageOverlayOpen = $state(false);
	let activeImageUrl = $state("");

	function openImage(url: string) {
		activeImageUrl = url;
		isImageOverlayOpen = true;
	}
</script>

<div class="flex w-full max-w-5xl flex-col gap-6 px-8">
	{#if rightNowState.loading}
		{#each Array.from({ length: 10 })}
			<div class="h-20 w-full animate-pulse rounded-md bg-stone-700"></div>
		{/each}
	{:else if rightNowState.error}
		<div class="col-span-full flex p-4">
			<ApiErrorDisplay
				error={rightNowState.error}
				onRetry={() => rightNowState.refresh()}
				class="m-auto"
			/>
		</div>
	{:else if !rightNowState.posts.length}
		<RightNowEmptyFeed />
	{:else}
		{#each rightNowState.posts as post}
			<RightNowPost {...post} {ourProfileId} onImageClick={openImage} />
		{/each}
	{/if}
</div>

<ZoomableImage bind:open={isImageOverlayOpen} src={activeImageUrl} />
