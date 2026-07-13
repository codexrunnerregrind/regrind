<script lang="ts">
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import QuickFilters from "./QuickFilters.svelte";

	let openFilters = $state({
		age: false,
		position: false,
		hosting: false,
	});
</script>

<ProgressiveBlur
	data-fixed-header
	class="fixed top-0 left-0 z-10 w-full"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex flex-col pt-fixed-header"
	direction="topToBottom"
>
	<div class="scrollbar-thin flex gap-0.5 overflow-x-auto p-4 pt-0">
		<QuickFilters bind:openFilters />
	</div>
</ProgressiveBlur>
<div class="h-9"></div>
