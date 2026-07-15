<script lang="ts">
	import { afterNavigate, beforeNavigate } from "$app/navigation";
	import { onDestroy } from "svelte";
	import PhotoSwipeLightbox from "photoswipe/lightbox";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
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

	let lightbox: PhotoSwipeLightbox | null = null;
	let feedContainer = $state<HTMLElement | null>(null);

	$effect(() => {
		if (
			rightNowState.loading ||
			rightNowState.posts.length === 0 ||
			!feedContainer
		) {
			return;
		}

		if (lightbox) {
			lightbox.destroy();
		}

		lightbox = new PhotoSwipeLightbox({
			gallery: feedContainer,
			children: "a.pswp-trigger",
			pswpModule: () => import("photoswipe"),
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

		lightbox.init();
	});

	onDestroy(() => {
		if (lightbox) {
			lightbox.destroy();
			lightbox = null;
		}
	});
</script>

<div
	bind:this={feedContainer}
	class="flex w-full max-w-5xl flex-col gap-6 px-2"
>
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
			<RightNowPost {...post} {ourProfileId} />
		{/each}
	{/if}
</div>
