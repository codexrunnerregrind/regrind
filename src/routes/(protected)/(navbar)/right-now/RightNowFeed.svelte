<script lang="ts">
	import { afterNavigate, beforeNavigate } from "$app/navigation";

	import ZoomableImage from "./ZoomableImage.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import RightNowPost from "./RightNowPost.svelte";

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
	{:else if !rightNowState.loading && !rightNowState.posts.length}
		<div>TODO: No results found</div>
	{:else}
		{#each rightNowState.posts as post}
			<RightNowPost {...post} {ourProfileId} onImageClick={openImage} />
		{/each}
	{/if}
</div>

<ZoomableImage bind:open={isImageOverlayOpen} src={activeImageUrl} />
