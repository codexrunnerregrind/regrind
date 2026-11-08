<script lang="ts">
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";
	import type PhotoSwipe from "photoswipe";

	import { imagesHidden, revealedImages } from "./image-privacy.svelte";

	let { pswp }: { pswp: PhotoSwipe } = $props();

	let current = $state<string | null>(null);

	function mark(): void {
		current = pswp.currSlide?.data.src ?? null;
		for (const { el, slide } of pswp.mainScroll.itemHolders) {
			const src = slide?.data.src;
			const shown = src !== undefined && revealedImages.has(src);
			for (const media of el.querySelectorAll("img, video"))
				media.toggleAttribute("data-revealed", shown);
		}
	}

	$effect(() => {
		void revealedImages.size;
		mark();
	});

	$effect(() => {
		const events = ["change", "contentAppend", "loadComplete"] as const;
		const later = () => queueMicrotask(mark);
		for (const name of events) pswp.on(name, later);
		return () => {
			for (const name of events) pswp.off(name, later);
		};
	});

	const stop = (event: Event) => event.stopPropagation();
</script>

{#if current !== null && imagesHidden()}
	{@const revealed = revealedImages.has(current)}
	<button
		type="button"
		aria-label={revealed ? "Hide image" : "Reveal image"}
		class="pointer-events-auto absolute top-1/2 left-1/2 flex size-9 -translate-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:bg-black/60"
		onpointerdown={stop}
		onpointerup={stop}
		ontouchstart={stop}
		ontouchend={stop}
		onclick={(event) => {
			event.stopPropagation();
			if (current === null) return;
			if (revealed) revealedImages.delete(current);
			else revealedImages.add(current);
		}}
	>
		{#if revealed}
			<EyeSlashIcon weight="fill" class="size-4.5" />
		{:else}
			<EyeIcon weight="fill" class="size-4.5" />
		{/if}
	</button>
{/if}
