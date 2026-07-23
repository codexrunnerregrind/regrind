<script lang="ts">
	import { goto } from "$app/navigation";
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import LockKeyIcon from "phosphor-svelte/lib/LockKeyIcon";

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
		"flex min-h-0 flex-1 flex-col gap-4 overflow-auto overscroll-contain px-3 pt-2 pb-nav-clear",
		className,
	]}
>
	<button
		type="button"
		class="flex items-center gap-3 rounded-2xl border bg-muted/40 p-3 text-start transition-colors hover:bg-muted/60"
		onclick={openMyAlbums}
	>
		<span
			class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"
		>
			<LockKeyIcon weight="fill" class="size-6" />
		</span>
		<span class="flex min-w-0 flex-col">
			<span class="font-medium">My Albums</span>
			<span class="text-xs text-muted-foreground">
				Albums you create and share
			</span>
		</span>
		<CaretRightIcon class="ms-auto size-5 shrink-0 text-muted-foreground" />
	</button>

	<section class="flex min-h-0 flex-1 flex-col gap-2">
		<h2 class="px-0.5 text-sm font-medium text-muted-foreground">
			Shared with me
		</h2>
		<SharedAlbumsGrid />
	</section>
</div>
