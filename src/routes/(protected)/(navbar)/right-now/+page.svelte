<script lang="ts">
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import TopBar from "./top-bar/TopBar.svelte";
	import RightNowFeed from "./RightNowFeed.svelte";

	let { data }: import("./$types").PageProps = $props();

	const ourProfileId = $derived(data.ourProfileId);

	let feedContainer: HTMLElement | null = $state(null);
</script>

<main class="flex min-h-[calc(var(--screen-scroll)+3.5rem)] flex-col gap-4 p-4">
	<TopBar />
	<div class="flex flex-col items-center" bind:this={feedContainer}>
		{#if !rightNowState.loading && !rightNowState.error}
			<DataRefreshControl
				container={feedContainer}
				windowScroll
				updating={rightNowState.refreshing}
				position="top"
				class="mb-3"
				containerClass="z-1"
				onclick={() => void rightNowState.reload()}
			/>
		{/if}
		<RightNowFeed {ourProfileId} />
	</div>
</main>
