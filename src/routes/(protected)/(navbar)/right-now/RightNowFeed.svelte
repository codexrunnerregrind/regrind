<script lang="ts">
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ListRowSkeleton from "$lib/components/feedback/ListRowSkeleton.svelte";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import RightNowEmptyFeed from "./RightNowEmptyFeed.svelte";
	import RightNowPost from "./RightNowPost.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	$effect.pre(() => {
		rightNowState.load();
	});
</script>

<div class="mx-auto flex w-full max-w-120 flex-col gap-0">
	{#if rightNowState.loading}
		{#each Array.from({ length: 10 })}
			<ListRowSkeleton />
		{/each}
	{:else if rightNowState.error}
		<div class="flex p-4">
			<ApiErrorDisplay
				error={rightNowState.error}
				onRetry={() => rightNowState.refresh()}
				class="m-auto"
			/>
		</div>
	{:else if !rightNowState.posts.length}
		<RightNowEmptyFeed />
	{:else}
		{#each rightNowState.posts as post (post.id)}
			<RightNowPost {...post} {ourProfileId} />
		{/each}
	{/if}
</div>
