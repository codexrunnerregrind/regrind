<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";
	import { toast } from "svelte-sonner";
	import { SvelteSet } from "svelte/reactivity";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSavedLocationsSnapshot } from "$lib/app-data/preferences.svelte";
	import {
		type ExportedPlace,
		importSavedPlaces,
		parseSavedPlacesExport,
		placeImportStatus,
		SavedPlacesImportError,
	} from "$lib/app-data/saved-locations-transfer";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { formatCoordinates } from "$lib/model/saved-location";
	import { pickTextFile } from "$lib/platform/data-file";

	let places = $state<ExportedPlace[] | null>(null);
	let importing = $state(false);
	let barHeight = $state(0);
	const selected = new SvelteSet<number>();

	const rows = $derived(
		(places ?? []).map((place, index) => ({
			place,
			index,
			status: placeImportStatus(getSavedLocationsSnapshot(), place),
		})),
	);
	const selectable = $derived(rows.filter((row) => row.status !== "saved"));
	const chosen = $derived(
		selectable.filter((row) => selected.has(row.index)),
	);
	const allSelected = $derived(
		selectable.length > 0 && chosen.length === selectable.length,
	);

	const plural = (count: number) =>
		count === 1 ? "1 place" : `${count} places`;

	async function pick() {
		if (importing) return;
		try {
			const text = await pickTextFile();
			if (text === null) return;
			const data = parseSavedPlacesExport(text);
			if (data.places.length === 0) {
				toast.info("That export has no saved places in it");
				return;
			}
			places = data.places;
			selected.clear();
			for (const row of rows) {
				if (row.status !== "saved") selected.add(row.index);
			}
		} catch (caught) {
			console.error(caught);
			if (caught instanceof SavedPlacesImportError) {
				toast.error(caught.message);
			} else {
				showErrorToast({
					label: "Couldn't read that file",
					error: caught,
				});
			}
		}
	}

	async function run() {
		if (importing || chosen.length === 0) return;
		importing = true;
		try {
			const { added, existing, skipped } = await importSavedPlaces(
				chosen.map((row) => row.place),
			);
			const changed = added + existing;
			const label = `Imported ${plural(changed)}`;
			if (skipped > 0) {
				toast.warning(`${label} — ${skipped} over the limit`);
			} else {
				toast.success(label);
			}
			places = null;
			selected.clear();
		} catch (caught) {
			console.error(caught);
			showErrorToast({
				label: "Couldn't import saved places",
				error: caught,
			});
		} finally {
			importing = false;
		}
	}
</script>

<svelte:head>
	<title>Import saved places</title>
</svelte:head>

<p class="pt-1 pb-3.5 text-preview/[1.45] text-pretty text-ink3">
	Pick a file you exported earlier. The places you tick are added to the ones
	you already have — nothing is renamed or removed.
</p>

{#if places === null}
	<Button variant="outline" class="w-full" onclick={() => void pick()}>
		<FolderOpenIcon weight="fill" />
		Choose a file
	</Button>
{:else}
	<div
		class="mb-[calc(-4rem-0.5rem-var(--content-pb)-var(--bar-content-gap))]"
		style:padding-bottom="{barHeight}px"
	>
		<div class="flex items-center justify-between gap-3 pb-3">
			<span class="section-label">
				{chosen.length} of {selectable.length} selected
			</span>
			<button
				type="button"
				class="shrink-0 rounded-lg border border-border px-3 py-1.5 text-preview font-medium transition-colors disabled:opacity-50 can-hover:hover:bg-muted"
				disabled={importing || selectable.length === 0}
				onclick={() => {
					const select = !allSelected;
					for (const row of selectable) {
						if (select) selected.add(row.index);
						else selected.delete(row.index);
					}
				}}
			>
				{allSelected ? "Deselect all" : "Select all"}
			</button>
		</div>

		<div class="flex flex-col">
			{#each rows as row (row.index)}
				{@const saved = row.status === "saved"}
				<label
					class={[
						"flex items-center gap-3.5 py-3.5 not-last:border-b not-last:border-border",
						{
							"opacity-55": importing || saved,
							"cursor-pointer": !importing && !saved,
						},
					]}
				>
					<Checkbox
						checked={saved || selected.has(row.index)}
						disabled={importing || saved}
						onCheckedChange={(value) => {
							if (value) selected.add(row.index);
							else selected.delete(row.index);
						}}
						aria-label="Include {row.place.name}"
					/>
					<span
						class={[
							"shrink-0",
							{
								"text-yellow-500": row.place.favorite,
								"text-muted-foreground": !row.place.favorite,
							},
						]}
					>
						{#if row.place.favorite}
							<StarIcon weight="fill" class="size-5" />
						{:else}
							<MapPinIcon weight="fill" class="size-5" />
						{/if}
					</span>
					<span class="flex min-w-0 flex-1 flex-col gap-0.5">
						<span class="truncate text-row font-semibold">
							{row.place.name}
						</span>
						<span class="truncate text-2xs text-ink3">
							{#if saved}
								Already saved
							{:else if row.status === "star"}
								Saved as recent — will be starred
							{:else}
								{row.place.favorite ? "Starred" : "Recent"} · {formatCoordinates(
									row.place,
								)}
							{/if}
						</span>
					</span>
				</label>
			{/each}
		</div>
	</div>
	<div
		bind:clientHeight={barHeight}
		class="fixed inset-x-0 bottom-0 z-40 bg-background px-4 pt-4 pb-nav-clear"
	>
		<div
			class="mx-auto flex w-full max-w-120 flex-col gap-2 sm:flex-row-reverse"
		>
			<Button
				class="w-full"
				disabled={importing || chosen.length === 0}
				onclick={() => void run()}
			>
				Import {plural(chosen.length)}
			</Button>
			<Button
				variant="outline"
				class="w-full"
				disabled={importing}
				onclick={() => void pick()}
			>
				Choose another file
			</Button>
		</div>
	</div>
{/if}
