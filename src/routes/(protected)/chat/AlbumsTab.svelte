<script lang="ts">
	import { goto } from "$app/navigation";

	import { sharedAlbums } from "$lib/components/albums/shared-albums-state.svelte";
	import SharedAlbumsGrid from "$lib/components/albums/SharedAlbumsGrid.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { hapticImpact, hapticSelection } from "$lib/platform/haptics";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";

	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();

	let container: HTMLDivElement | null = $state(null);

	// Opening an album unmounts the tab — the grid comes back from cache, so the
	// position it was read at has to come back with it.
	restoreScrollOnce(() => container, sharedAlbums);

	function openMyAlbums() {
		hapticSelection();
		void goto("/albums");
	}
</script>

<div
	bind:this={container}
	data-scroll-root
	class={[
		"flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain px-screen pt-2",
		className,
	]}
	onscroll={() => (sharedAlbums.scrollY = container?.scrollTop ?? 0)}
>
	<!-- A hair taller than the scroller, so a short grid still has the overscroll
	     the pull gesture reads from — but shrink-0, not flex-1: flex-1 would
	     basis-0 this to the scroller's visible height, and the grid would spill
	     out of it, uncounted in scrollHeight and hidden under the navbar. The
	     navbar clearance rides here rather than on the scroller for the same
	     reason it does on the Messages tab. -->
	<div class="flex min-h-overscrollable shrink-0 flex-col pb-nav-clear">
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
