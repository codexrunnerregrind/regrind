<script lang="ts">
	import { goto } from "$app/navigation";

	import SharedAlbumsGrid from "$lib/components/albums/SharedAlbumsGrid.svelte";
	import { hapticSelection } from "$lib/platform/haptics";

	let {
		class: className,
	}: {
		class?: import("svelte/elements").ClassValue;
	} = $props();

	function openMyAlbums() {
		hapticSelection();
		void goto("/albums");
	}
</script>

<div
	class={[
		"flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain px-screen pt-2 pb-nav-clear",
		className,
	]}
>
	<SharedAlbumsGrid onOpenMyAlbums={openMyAlbums} />
</div>
