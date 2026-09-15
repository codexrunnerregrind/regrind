<script lang="ts">
	import type PhotoSwipe from "photoswipe";

	import type { PhotoSwipeBadge } from "$lib/util/photoswipe";
	import TakenOnGrindrBadge from "./TakenOnGrindrBadge.svelte";

	let {
		pswp,
		badgeAt,
	}: {
		pswp: PhotoSwipe;
		badgeAt: (index: number) => PhotoSwipeBadge | null;
	} = $props();

	let index = $state(0);

	$effect(() => {
		const onChange = () => (index = pswp.currIndex);
		onChange();
		pswp.on("change", onChange);
		return () => pswp.off("change", onChange);
	});

	const badge = $derived(badgeAt(index));
</script>

{#if badge !== null}
	<TakenOnGrindrBadge
		createdAt={badge.createdAt}
		class="absolute start-[calc(1rem+var(--safe-area-left))] bottom-[calc(1rem+var(--safe-area-bottom))] z-10"
	/>
{/if}
