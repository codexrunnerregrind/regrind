<script lang="ts">
	import CaretDownIcon from "phosphor-svelte/lib/CaretDownIcon";
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";
	import type { SvelteSet } from "svelte/reactivity";

	import IconTile from "$lib/components/settings/IconTile.svelte";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { formatCoordinates } from "$lib/model/saved-location";
	import type {
		ExportedPlace,
		PlaceImportStatus,
	} from "$lib/app-data/saved-locations-transfer";

	let {
		rows,
		selected,
		disabled = false,
	}: {
		rows: {
			place: ExportedPlace;
			index: number;
			status: PlaceImportStatus;
		}[];
		/** Indexes that are ticked. Mutated in place. */
		selected: SvelteSet<number>;
		disabled?: boolean;
	} = $props();

	let expanded = $state(false);

	// Already saved places can't be imported again, so they sit out of the tally.
	const selectable = $derived(rows.filter((row) => row.status !== "saved"));
	const chosen = $derived(
		selectable.filter((row) => selected.has(row.index)).length,
	);
	const summary = $derived(
		selectable.length === 0
			? "All already saved"
			: `${chosen} of ${selectable.length} selected`,
	);
</script>

<!-- The whole part reads as one row of the card, like Settings above it; its
     places unfold underneath as rows of the same card. -->
<div class="flex min-h-14 w-full items-center">
	<button
		type="button"
		class="flex min-w-0 flex-1 items-center gap-3.5 self-stretch py-3 ps-4 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		<IconTile>
			<MapPinIcon weight="fill" />
		</IconTile>
		<span class="flex min-w-0 flex-1 flex-col gap-0.5">
			<span
				class="truncate font-heading text-row leading-snug font-medium"
			>
				Saved places
			</span>
			<span class="text-caption leading-snug text-muted-foreground">
				{summary}
			</span>
		</span>
		<CaretDownIcon
			weight="bold"
			class={[
				"size-4 shrink-0 text-muted-foreground/60 transition-transform",
				{ "rotate-180": expanded },
			]}
		/>
	</button>
	<span class="flex self-stretch ps-3.5 pe-4">
		<Checkbox
			class="my-auto"
			checked={selectable.length > 0 && chosen === selectable.length}
			indeterminate={chosen > 0 && chosen < selectable.length}
			disabled={disabled || selectable.length === 0}
			onCheckedChange={(value) => {
				for (const row of selectable) {
					if (value) selected.add(row.index);
					else selected.delete(row.index);
				}
			}}
			aria-label="Restore saved places"
		/>
	</span>
</div>

{#if expanded}
	{#each rows as row (row.index)}
		{@const saved = row.status === "saved"}
		<label
			class={[
				"flex min-h-14 w-full items-center gap-3.5 px-4 py-3",
				{
					"opacity-55": disabled || saved,
					"cursor-pointer": !disabled && !saved,
				},
			]}
		>
			<!-- An empty tile lines the name up with "Saved places" above. -->
			<IconTile><span></span></IconTile>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="flex items-center gap-1.5 text-row leading-snug">
					<span class="truncate">{row.place.name}</span>
					{#if row.place.favorite}
						<StarIcon
							weight="fill"
							class="size-3.5 shrink-0 text-yellow-500"
						/>
					{/if}
				</span>
				<span class="truncate text-caption text-muted-foreground">
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
			<Checkbox
				checked={saved || selected.has(row.index)}
				disabled={disabled || saved}
				onCheckedChange={(value) => {
					if (value) selected.add(row.index);
					else selected.delete(row.index);
				}}
				aria-label="Include {row.place.name}"
			/>
		</label>
	{/each}
{/if}
