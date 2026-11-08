<script lang="ts">
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";

	import { revealedImages } from "./image-privacy.svelte";

	// A sibling of the image, centred on it through their shared offset parent,
	// so the image's own layout and the tile's tap handling stay untouched.
	let { image, src }: { image: HTMLElement; src: string } = $props();

	let box = $state<{ x: number; y: number; size: number } | null>(null);

	$effect(() => {
		const measure = () => {
			const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = image;
			box =
				offsetWidth < 24 || offsetHeight < 24
					? null
					: {
							x: offsetLeft + offsetWidth / 2,
							y: offsetTop + offsetHeight / 2,
							size: Math.min(offsetWidth, offsetHeight),
						};
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(image);
		if (image.offsetParent) observer.observe(image.offsetParent);
		return () => observer.disconnect();
	});

	const stop = (event: Event) => event.stopPropagation();
</script>

{#if box}
	<button
		type="button"
		aria-label="Reveal image"
		class={[
			"absolute z-2 flex -translate-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:bg-black/60",
			{ "size-7": box.size < 64, "size-10": box.size >= 64 },
		]}
		style:left="{box.x}px"
		style:top="{box.y}px"
		onpointerdown={stop}
		onpointerup={stop}
		ontouchstart={stop}
		ontouchend={stop}
		oncontextmenu={stop}
		ondblclick={stop}
		onclick={(event) => {
			event.preventDefault();
			event.stopPropagation();
			revealedImages.add(src);
		}}
	>
		<EyeIcon
			weight="fill"
			class={{ "size-4": box.size < 64, "size-5": box.size >= 64 }}
		/>
	</button>
{/if}
