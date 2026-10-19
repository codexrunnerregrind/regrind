<script lang="ts">
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";

	import TakenOnGrindrBadge from "$lib/components/media/TakenOnGrindrBadge.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { Button } from "$lib/components/ui/button";
	import { profileMediaUrl } from "$lib/util/media";

	let {
		mediaHash,
		position,
		takenOnGrindr = false,
		onDelete,
	}: {
		mediaHash: string;
		position: number;
		/** Stamped as taken on Grindr, so the badge is on it. */
		takenOnGrindr?: boolean;
		onDelete: () => void;
	} = $props();

	const src = $derived(profileMediaUrl({ mediaHash, size: "thumb" }));
</script>

<div class="relative aspect-square overflow-hidden rounded-xl bg-muted">
	<MediaImage
		{src}
		alt="Profile photo {position}"
		class="size-full"
		tone="photo"
		size="md"
		loading="lazy"
	/>
	{#if takenOnGrindr}
		<TakenOnGrindrBadge compact class="absolute start-1.5 bottom-1.5" />
	{/if}
	<Button
		variant="destructive"
		size="icon-sm"
		class="absolute top-1.5 right-1.5 rounded-full bg-background/70 scrim backdrop-filter-(--bd-veil)"
		onclick={() => onDelete()}
		aria-label="Remove profile photo {position}"
	>
		<TrashIcon class="size-4" />
	</Button>
</div>
