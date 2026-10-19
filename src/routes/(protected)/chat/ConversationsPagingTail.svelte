<script lang="ts">
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ListRowSkeleton from "$lib/components/feedback/ListRowSkeleton.svelte";
	import PagingSentinel from "$lib/components/shared/PagingSentinel.svelte";
	import type { SentinelPaging } from "$lib/util/sentinel-paging.svelte";
	import EmptyConversationsList from "./EmptyConversationsList.svelte";

	let {
		paging,
		hasMore,
		listEmpty,
		filtered,
	}: {
		paging: SentinelPaging;
		hasMore: boolean;
		listEmpty: boolean;
		filtered: boolean;
	} = $props();
</script>

<div role="status" class="sr-only">
	{paging.running
		? "Loading more conversations"
		: paging.failure
			? "Failed to load more conversations"
			: ""}
</div>
{#if listEmpty && !hasMore}
	<EmptyConversationsList {filtered} />
{/if}
{#if hasMore}
	{#if paging.failure}
		<div class={["flex", { "flex-1": listEmpty }]}>
			<ApiErrorDisplay
				error={paging.failure}
				onRetry={() => paging.retry()}
				class="m-auto"
			/>
		</div>
	{:else if paging.running || listEmpty}
		{#each Array(listEmpty ? 8 : 6)}
			<ListRowSkeleton />
		{/each}
	{/if}
	<PagingSentinel {paging} class="h-0" />
{/if}
