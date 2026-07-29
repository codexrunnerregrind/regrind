<script lang="ts">
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import TopBar from "./top-bar/TopBar.svelte";
	import RightNowFeed from "./RightNowFeed.svelte";

	let { data }: import("./$types").PageProps = $props();

	const ourProfileId = $derived(data.ourProfileId);

	let feedContainer: HTMLElement | null = $state(null);
</script>

<main class="screen-nav-host">
	<div class="pull-scroller" bind:this={feedContainer}>
		<!-- No horizontal padding here: the feed rows carry their own ps-4/pe-4 so
		     they align with the inbox and taps lists. -->
		<div class="flex min-h-overscrollable flex-col gap-4 pt-3 pb-nav-clear">
			<TopBar />
			<div class="flex flex-col items-center">
				<RightNowFeed {ourProfileId} />
			</div>
		</div>
	</div>
	{#if !rightNowState.loading && !rightNowState.error}
		<DataRefreshControl
			container={feedContainer}
			updating={rightNowState.refreshing}
			position="top"
			onrefresh={() => void rightNowState.reload()}
		/>
	{/if}
</main>
