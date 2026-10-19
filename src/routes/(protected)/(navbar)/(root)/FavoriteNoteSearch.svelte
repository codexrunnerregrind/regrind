<script lang="ts">
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Spinner } from "$lib/components/ui/spinner";
	import type { FavoriteSearch } from "$lib/favorites/favorite-search.svelte";

	let { search }: { search: FavoriteSearch } = $props();
</script>

<!-- Sits under the filter chips, and only while the favorites filter is on:
     notes exist for favorites, so there is nothing to search anywhere else. -->
<div class="flex items-center gap-2 px-4 pb-3">
	<div class="relative flex-1">
		<MagnifyingGlassIcon
			class="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink3"
		/>
		<Input
			type="search"
			placeholder="Search notes"
			aria-label="Search notes"
			value={search.query}
			oninput={(event) => search.search(event.currentTarget.value)}
			onkeydown={(event) => {
				if (event.key === "Escape") search.clear();
			}}
			class="rounded-md border-transparent bg-muted ps-9"
		/>
	</div>
	{#if search.loading}
		<Spinner class="size-4 shrink-0 text-muted-foreground" />
	{:else if search.active}
		<Button
			variant="ghost"
			size="icon"
			aria-label="Clear search"
			class="shrink-0"
			onclick={() => search.clear()}
		>
			<XIcon class="size-5" />
		</Button>
	{/if}
</div>
