<script lang="ts">
	import MatureContentCover from "#lib/components/mature-content/MatureContentCover.svelte";
	import MediaImage from "#lib/components/shared/MediaImage.svelte";

	let {
		src,
		thumb,
		createdAt,
		label,
		covered = false,
	}: {
		src: string;
		thumb: string;
		createdAt: number | null;
		label: string;
		covered?: boolean;
	} = $props();

	let width: number | null = $state(null);
	let height: number | null = $state(null);
	let failedSrc: string | null = $state(null);
	const failed = $derived(failedSrc === thumb);
</script>

<svelte:element
	this={covered ? "div" : "a"}
	class="item relative block aspect-auto h-full max-h-[inherit] w-full shrink-0"
	data-cropped="true"
	data-pswp-width={width}
	data-pswp-height={height}
	data-created-at={createdAt}
	href={covered || failed ? undefined : src}
	role={covered ? "group" : undefined}
	aria-disabled={failed ? "true" : undefined}
	aria-label={label}
>
	<MediaImage
		src={thumb}
		class="absolute top-0 left-0 h-full w-full"
		imgClass="bg-stone-700"
		tone="photo"
		size="xl"
		bind:failedSrc
		onload={(image) => {
			width = image.naturalWidth;
			height = image.naturalHeight;
		}}
	/>
	{#if covered}
		<MatureContentCover />
	{/if}
</svelte:element>

<style lang="postcss">
	@reference "$layout";
	.item {
		scroll-snap-stop: always;
	}
</style>
