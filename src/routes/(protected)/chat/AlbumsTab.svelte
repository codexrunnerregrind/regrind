<script lang="ts">
	import MyAlbumsGrid from "$lib/components/albums/MyAlbumsGrid.svelte";

	let {
		class: className,
	}: {
		class?: import("svelte/elements").ClassValue;
	} = $props();
</script>

<div
	class={[
		"flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain px-3 pt-2 pb-nav-clear",
		className,
	]}
>
	<MyAlbumsGrid />
</div>
