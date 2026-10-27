<script lang="ts">
	import { formatDistanceStrict } from "date-fns";
	import AirplaneTiltIcon from "phosphor-svelte/lib/AirplaneTiltIcon";

	import { getNow } from "$lib/util/now";

	let {
		onlineUntil,
		seen,
		isVisiting = false,
		self = false,
	}: {
		onlineUntil: number | null;
		seen: number | null;
		isVisiting?: boolean;
		self?: boolean;
	} = $props();

	const online = $derived(onlineUntil !== null && onlineUntil > getNow());
</script>

{#snippet visiting(className: string)}
	<AirplaneTiltIcon weight="fill" class={["size-3 shrink-0", className]} />
	<span class="sr-only">Visiting.</span>
{/snippet}

{#if self || online}
	<div class="flex items-center gap-1.5 whitespace-nowrap">
		{#if isVisiting}
			{@render visiting("text-green-500")}
		{:else}
			<span
				class="ms-0.5 inline-block size-2 shrink-0 rounded-full bg-green-500"
			>
			</span>
		{/if}
		Online now
	</div>
{:else}
	<span class="flex items-center gap-1.5 whitespace-nowrap text-gray-500">
		{#if isVisiting}
			{@render visiting("")}
		{/if}
		{#if seen !== null}
			Online {formatDistanceStrict(seen, getNow(), { addSuffix: true })}
		{:else}
			Offline
		{/if}
	</span>
{/if}
