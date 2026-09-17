<script lang="ts">
	import SealCheckIcon from "phosphor-svelte/lib/SealCheckIcon";
	import type { ClassValue } from "svelte/elements";

	import { formatTimeRelativeCustom } from "$lib/util/format-time";

	let {
		createdAt = null,
		compact = false,
		class: className,
	}: {
		/** When it was taken. The time is what the stamp certifies, so a photo
		 *  that carries none shows the seal alone. */
		createdAt?: number | null;
		/** For a thumbnail, where the time would not fit anyway. */
		compact?: boolean;
		/** Where it sits: the caller owns the corner. */
		class?: ClassValue;
	} = $props();

	const time = $derived(
		createdAt === null || compact
			? null
			: formatTimeRelativeCustom(createdAt),
	);
</script>

<!-- Quiet by design: a mark on someone's photo, not app furniture. -->
<span
	class={[
		"pointer-events-none flex items-center gap-0.5 rounded-full bg-black/45 scrim text-distance leading-none font-medium text-white/90 backdrop-filter-(--bd-veil)",
		{ "p-1": compact, "px-1.5 py-1": !compact },
		className,
	]}
	title="Taken on Grindr"
>
	<SealCheckIcon weight="fill" class="size-3" />
	<span class="sr-only">Taken on Grindr</span>
	{#if time !== null}{time}{/if}
</span>
