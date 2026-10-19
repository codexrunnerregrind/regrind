<script lang="ts">
	import type { Snippet } from "svelte";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import * as Tabs from "$lib/components/ui/tabs";

	let {
		children,
		trailing,
		index,
		count,
	}: {
		children: Snippet;
		trailing?: Snippet;
		/** The active tab's position, for the sliding pill. */
		index: number;
		count: number;
	} = $props();
</script>

<ProgressiveBlur
	direction="bottomToTop"
	data-slot="media-sheet-tab-bar"
	class="absolute inset-x-0 bottom-0 z-10 select-none"
	bgClass="bg-linear-to-t from-background to-transparent"
	contentClass="grid grid-cols-[1fr_auto_1fr] items-end gap-x-2 px-4 pt-1 pb-2"
>
	<!-- The attachments sheet's capsule: glass, one sliding pill, equal-width
	     tabs. -->
	<Tabs.List
		class="glass-capsule relative col-start-2 bg-transparent p-1.5 ring-0 glass-normal"
	>
		<span
			aria-hidden="true"
			class="pointer-events-none absolute inset-y-1.5 left-1.5 rounded-full bg-primary/15 ring-1 ring-primary/25 transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
			style:width="calc((100% - 0.75rem) / {count})"
			style:transform="translateX(calc({index} * 100%))"
		></span>
		{@render children()}
	</Tabs.List>
	{#if trailing}
		<div class="col-start-3 max-w-full min-w-0 justify-self-end pb-1">
			{@render trailing()}
		</div>
	{/if}
</ProgressiveBlur>
