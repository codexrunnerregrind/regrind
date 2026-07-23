<script lang="ts">
	import { HouseIcon, DropIcon } from "phosphor-svelte";

	import type { RightNowStatus } from "$lib/model/right-now";

	let {
		rightNow,
		class: className,
	}: {
		rightNow?: RightNowStatus | null;
		class?: import("svelte/elements").ClassValue;
	} = $props();
</script>

{#if rightNow === "HOSTING" || rightNow === "NOT_HOSTING"}
	<div class={["flex shrink-0 text-fuchsia-600", className]}>
		{#if rightNow === "HOSTING"}
			<HouseIcon weight="fill" class="size-3" />
		{:else}
			<DropIcon weight="fill" class="size-3" />
		{/if}
	</div>
{/if}
