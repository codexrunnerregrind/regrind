<script lang="ts">
	import BookmarkSimpleIcon from "phosphor-svelte/lib/BookmarkSimpleIcon";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import PencilSimpleIcon from "phosphor-svelte/lib/PencilSimpleIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";
	import { tick } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getFavoriteLocations,
		getRecentLocations,
		removeSavedLocation,
		renameSavedLocation,
		setSavedLocationFavorite,
		touchSavedLocation,
	} from "$lib/app-data/saved-locations";
	import Button from "$lib/components/ui/button/button.svelte";
	import { Input } from "$lib/components/ui/input";
	import {
		formatCoordinates,
		type SavedLocation,
	} from "$lib/model/saved-location";

	let {
		onPick,
		onClose,
		// Entry to open in rename mode, set right after a save so the auto-derived
		// name can be corrected without hunting for the row.
		editing = $bindable(),
	}: {
		onPick: (location: SavedLocation) => void;
		onClose: () => void;
		editing?: string | undefined;
	} = $props();

	const favorites = $derived(getFavoriteLocations());
	const recents = $derived(getRecentLocations());

	let listEl: HTMLElement | null = $state(null);
	let draftName = $state("");
	// Which row `draftName` belongs to, so a draft is seeded exactly once — the
	// user is free to empty the field without it refilling itself.
	let draftFor: string | undefined = $state();
	let nameInput: HTMLInputElement | null = $state(null);

	async function startEditing(location: SavedLocation) {
		editing = location.id;
		draftFor = location.id;
		draftName = location.name;
		await tick();
		nameInput?.select();
		revealEditedRow();
	}

	/**
	 * Brings the row being renamed into view by scrolling the list itself.
	 * `scrollIntoView` would walk up to whichever ancestor iOS considers
	 * scrollable and drag the whole picker — header included — off the top of the
	 * screen.
	 */
	function revealEditedRow() {
		const row = nameInput?.closest("li");
		if (!listEl || !(row instanceof HTMLElement)) return;
		const centered =
			row.offsetTop - listEl.clientHeight / 2 + row.offsetHeight / 2;
		listEl.scrollTop = Math.max(0, centered);
	}

	function stopEditing() {
		editing = undefined;
		draftFor = undefined;
		draftName = "";
	}

	// A row put into edit mode from the outside (right after a save) arrives
	// without a draft; seed it from the stored name.
	$effect(() => {
		if (!editing) {
			if (draftFor) stopEditing();
			return;
		}
		if (draftFor === editing) return;
		const location = [...favorites, ...recents].find(
			(candidate) => candidate.id === editing,
		);
		if (location) void startEditing(location);
	});

	async function commitName(id: string) {
		const name = draftName;
		stopEditing();
		try {
			await renameSavedLocation(id, name);
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to rename location", error });
		}
	}

	async function toggleFavorite(location: SavedLocation) {
		try {
			await setSavedLocationFavorite(location.id, !location.favorite);
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to save location", error });
		}
	}

	async function remove(location: SavedLocation) {
		try {
			await removeSavedLocation(location.id);
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to delete location", error });
		}
	}

	async function pick(location: SavedLocation) {
		onPick(location);
		try {
			await touchSavedLocation(location.id);
		} catch (error) {
			// The pin already moved; a failed bump only costs list ordering.
			console.error(error);
		}
	}
</script>

{#snippet row(location: SavedLocation)}
	<li class="flex items-center gap-1">
		{#if editing === location.id}
			<Input
				bind:ref={nameInput}
				bind:value={draftName}
				class="h-9 flex-1 rounded-lg border-border bg-background"
				aria-label="Location name"
				maxlength={60}
				onkeydown={(event: KeyboardEvent) => {
					if (event.key === "Enter") {
						event.preventDefault();
						void commitName(location.id);
					} else if (event.key === "Escape") {
						event.preventDefault();
						stopEditing();
					}
				}}
			/>
			<Button
				size="icon"
				variant="ghost"
				aria-label="Save name"
				class="shrink-0 text-current hover:bg-muted"
				onclick={() => void commitName(location.id)}
			>
				<CheckIcon />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				aria-label="Cancel rename"
				class="shrink-0 text-current hover:bg-muted"
				onclick={stopEditing}
			>
				<XIcon />
			</Button>
		{:else}
			<Button
				variant="ghost"
				class="flex h-auto min-w-0 flex-1 cursor-pointer flex-col items-start justify-start gap-0 py-1.5 text-left text-current hover:bg-muted"
				onclick={() => void pick(location)}
			>
				<span class="block max-w-full truncate">{location.name}</span>
				<span
					class="block max-w-full truncate text-sm text-muted-foreground"
				>
					{formatCoordinates(location)}
				</span>
			</Button>
			<Button
				size="icon"
				variant="ghost"
				aria-label={location.favorite
					? `Remove ${location.name} from favorites`
					: `Add ${location.name} to favorites`}
				aria-pressed={location.favorite}
				class={[
					"shrink-0 hover:bg-muted",
					{
						// Same yellow the profile favorite stars use; --primary
						// would follow the user's accent instead.
						"text-yellow-500": location.favorite,
						"text-current": !location.favorite,
					},
				]}
				onclick={() => void toggleFavorite(location)}
			>
				<StarIcon weight={location.favorite ? "fill" : "regular"} />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				aria-label={`Rename ${location.name}`}
				class="shrink-0 text-current hover:bg-muted"
				onclick={() => void startEditing(location)}
			>
				<PencilSimpleIcon />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				aria-label={`Delete ${location.name}`}
				class="shrink-0 text-current hover:bg-muted"
				onclick={() => void remove(location)}
			>
				<TrashIcon />
			</Button>
		{/if}
	</li>
{/snippet}

<div class="absolute top-0 left-0 z-1020 size-full p-1">
	<div
		class="flex h-full w-full flex-col rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
	>
		<div class="flex items-center gap-2 border-b border-border px-2 py-2">
			<BookmarkSimpleIcon weight="fill" class="size-5 shrink-0" />
			<span class="flex-1 font-medium">Saved places</span>
			<Button
				size="icon"
				variant="ghost"
				aria-label="Close saved places"
				class="text-current hover:bg-muted"
				onclick={onClose}
			>
				<XIcon />
			</Button>
		</div>
		<div bind:this={listEl} class="flex-1 overflow-auto px-1 py-2">
			{#if favorites.length === 0 && recents.length === 0}
				<p class="p-4 text-center text-sm text-muted-foreground">
					No saved places yet. Drop a pin and tap the bookmark to save
					it here.
				</p>
			{/if}
			{#if favorites.length > 0}
				<h3
					class="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
				>
					Favorites
				</h3>
				<ul class="flex flex-col">
					{#each favorites as location (location.id)}
						{@render row(location)}
					{/each}
				</ul>
			{/if}
			{#if recents.length > 0}
				<h3
					class="px-2 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
				>
					Recent
				</h3>
				<ul class="flex flex-col">
					{#each recents as location (location.id)}
						{@render row(location)}
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>
