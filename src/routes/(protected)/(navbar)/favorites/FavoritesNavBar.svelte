<script lang="ts">
	import { ArrowLeftIcon, MagnifyingGlassIcon, XIcon } from "phosphor-svelte";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import type { FavoritesState } from "./favorites-state.svelte";

	let { favorites }: { favorites: FavoritesState } = $props();

	let searching = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (searching) input?.focus();
	});

	function stopSearching() {
		searching = false;
		favorites.search("");
	}
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="fixed top-0 left-0 z-20 h-[calc(4.75rem+var(--safe-area-top))] w-full shrink-0"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex items-center h-full pe-5.5 pt-(--safe-area-top)"
	tag="nav"
>
	<a href="/" class="flex h-full w-19 shrink-0 items-center justify-center">
		<ArrowLeftIcon size={32} />
	</a>
	{#if searching}
		<Input
			bind:ref={input}
			type="search"
			placeholder="Search notes and names"
			aria-label="Search favorites"
			value={favorites.query}
			oninput={(event) => favorites.search(event.currentTarget.value)}
			onkeydown={(event) => {
				if (event.key === "Escape") stopSearching();
			}}
			class="min-w-0 flex-1"
		/>
		<Button
			variant="ghost"
			size="icon-lg"
			aria-label="Close search"
			class="ms-1 shrink-0"
			onclick={stopSearching}
		>
			<XIcon class="size-6" />
		</Button>
	{:else}
		<span class="min-w-0 flex-1 truncate text-lg font-semibold">Favorites</span>
		<Button
			variant="ghost"
			size="icon-lg"
			aria-label="Search favorites"
			class="shrink-0"
			onclick={() => (searching = true)}
		>
			<MagnifyingGlassIcon class="size-6" />
		</Button>
	{/if}
</ProgressiveBlur>
