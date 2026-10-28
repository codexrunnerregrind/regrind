<script lang="ts">
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ListRowSkeleton from "$lib/components/feedback/ListRowSkeleton.svelte";
	import { myRightNowPost } from "$lib/right-now/my-post-state.svelte";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import RightNowEmptyFeed from "./RightNowEmptyFeed.svelte";
	import RightNowPost from "./RightNowPost.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	$effect.pre(() => {
		rightNowState.load();
	});

	// The feed keeps showing us our text as written even after moderation
	// refuses it; the active post is what is actually up.
	const ownPost = $derived(myRightNowPost.post);
	function textOf(post: { profileId: number; text: string | null }) {
		return ownPost !== null && post.profileId === ourProfileId
			? (ownPost.activeText ?? null)
			: post.text;
	}
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
			<RightNowPost {...post} text={textOf(post)} {ourProfileId} />
		{/each}
	{/if}
</div>
