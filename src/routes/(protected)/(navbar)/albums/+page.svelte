<script lang="ts">
	import { ArrowLeftIcon } from "phosphor-svelte";

	import MyAlbumsGrid from "$lib/components/albums/MyAlbumsGrid.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
</script>

<ProgressiveBlur
	direction="topToBottom"
	tag="nav"
	class="fixed top-0 left-0 z-20 h-[calc(4.75rem+var(--safe-area-top))] w-full shrink-0"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex items-center h-full pe-5.5 pt-(--safe-area-top)"
>
	<a
		href="/chat"
		class="flex h-full w-19 shrink-0 items-center justify-center"
		aria-label="Back to albums"
	>
		<ArrowLeftIcon size={32} />
	</a>
	<span class="min-w-0 truncate text-lg font-medium">My Albums</span>
</ProgressiveBlur>

<main class="flex w-full flex-1 px-3 pt-19 pb-nav-clear">
	<div class="mx-auto flex w-full max-w-160 flex-col">
		<MyAlbumsGrid />
	</div>
</main>
