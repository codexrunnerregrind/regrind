<script lang="ts">
	import { SealCheckIcon } from "phosphor-svelte";
	import type { ClassValue } from "svelte/elements";

	import { formatTimeRelativeCustom } from "$lib/util/format-time";

	let {
		createdAt = null,
		compact = false,
		class: className,
	}: {
		createdAt?: number | null;
		compact?: boolean;
		class?: ClassValue;
	} = $props();

	const time = $derived(
		createdAt === null || compact
			? null
			: formatTimeRelativeCustom(createdAt),
	);
</script>

<span
	class={[
		"pointer-events-none flex items-center gap-0.5 rounded-full bg-black/45 scrim text-2xs leading-none font-medium text-white/90 backdrop-filter-(--bd-veil)",
		{ "p-1": compact, "px-1.5 py-1": !compact },
		className,
	]}
	title="Taken on Grindr"
>
	<SealCheckIcon weight="fill" class="size-3" />
	<span class="sr-only">Taken on Grindr</span>
	{#if time !== null}{time}{/if}
</span>
