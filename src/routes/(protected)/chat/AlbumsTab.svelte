<script lang="ts">
	import { goto } from "$app/navigation";

	import { sharedAlbums } from "$lib/components/albums/shared-albums-state.svelte";
	import SharedAlbumsGrid from "$lib/components/albums/SharedAlbumsGrid.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { hapticImpact, hapticSelection } from "$lib/platform/haptics";

	let {
		class: className,
	}: {
		class?: import("svelte/elements").ClassValue;
	} = $props();

	let container: HTMLDivElement | null = $state(null);

	function openMyAlbums() {
		hapticSelection();
		void goto("/albums");
	}
</script>

<div
	bind:this={container}
	data-scroll-root
	class={[
		"flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain px-screen pt-2 pb-nav-clear",
		className,
	]}
>
	<!-- A hair taller than the scroller, so a short grid still has the overscroll
	     the pull gesture reads from. -->
	<div class="flex min-h-overscrollable flex-1 flex-col">
		<SharedAlbumsGrid onOpenMyAlbums={openMyAlbums} />
	</div>
</div>
{#if sharedAlbums.albums !== null}
	<DataRefreshControl
		{container}
		updating={sharedAlbums.refreshing}
		position="top"
		hintOffset={12}
		onrefresh={() => {
			hapticImpact("light");
			void sharedAlbums.refresh();
		}}
	/>
{/if}
