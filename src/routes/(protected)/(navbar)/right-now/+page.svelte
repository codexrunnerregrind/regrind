<script lang="ts">
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import MyPostButton from "./MyPostButton.svelte";
	import RightNowFeed from "./RightNowFeed.svelte";
	import TopBar from "./top-bar/TopBar.svelte";

	let { data }: import("./$types").PageProps = $props();

	const ourProfileId = $derived(data.ourProfileId);

	let feedContainer: HTMLElement | null = $state(null);

	// The feed scrolls inside .pull-scroller, not the window, so the offset has to
	// be tracked on the container to survive leaving and re-entering the tab.
	let scrollRestored = false;
	$effect(() => {
		if (
			!scrollRestored &&
			feedContainer &&
			!rightNowState.loading &&
			rightNowState.error === null
		) {
			scrollRestored = true;
			feedContainer.scrollTop = rightNowState.scrollY;
		}
	});
</script>

<main class="screen-nav-host">
	<div
		class="pull-scroller"
		bind:this={feedContainer}
		onscroll={() => (rightNowState.scrollY = feedContainer?.scrollTop ?? 0)}
	>
		<!-- No horizontal padding here: the feed rows carry their own ps-4/pe-4 so
		     they align with the inbox and taps lists. -->
		<div class="flex min-h-overscrollable flex-col gap-4 pt-3 pb-nav-clear">
			<TopBar />
			<div class="flex flex-col items-center">
				<RightNowFeed {ourProfileId} />
			</div>
		</div>
	</div>
	<MyPostButton />
	{#if !rightNowState.loading && !rightNowState.error}
		<DataRefreshControl
			container={feedContainer}
			updating={rightNowState.refreshing}
			position="top"
			onrefresh={() => void rightNowState.reload()}
		/>
	{/if}
	<ScrollToTopButton container={feedContainer} class="bottom-nav-clear" />
</main>
