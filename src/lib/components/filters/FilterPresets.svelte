<script lang="ts">
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import {
		overwriteFilterPreset,
		removeFilterPreset,
		renameFilterPreset,
		saveFilterPreset,
	} from "#lib/app-data/grid-filter-presets.ts";
	import { getGridFilterPresetsSnapshot } from "#lib/app-data/preferences.svelte.ts";
	import { ACTIVE_FILTER } from "#lib/components/filters/active-filter.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Dialog from "#lib/components/ui/dialog/index.ts";
	import { Input } from "#lib/components/ui/input/index.ts";
	import {
		FILTER_PRESET_NAME_MAX,
		type GridFilterPreset,
		maxFilterPresets,
	} from "#lib/model/browse/grid/filter-presets.ts";
	import { deepEqual } from "#lib/util/deep-equal.ts";
	import { longPressHandlers } from "#lib/util/long-press.ts";
	import type { GridSearchFilters } from "#lib/model/browse/grid/filters.ts";

	let {
		filters,
		onApply,
	}: {
		filters: GridSearchFilters;
		onApply: (filters: GridSearchFilters) => void;
	} = $props();

	const presets = $derived(getGridFilterPresetsSnapshot());
	const matchesAny = $derived(
		presets.some((preset) => deepEqual(preset.filters, filters)),
	);

	let editing: GridFilterPreset | null = $state(null);
	let draftName = $state("");

	function edit(preset: GridFilterPreset) {
		editing = preset;
		draftName = preset.name;
	}

	async function run(label: string, work: () => Promise<unknown>) {
		try {
			await work();
		} catch (error) {
			console.error(error);
			showErrorToast({ label, error });
		}
	}

	function saveCurrent() {
		void run("Failed to save preset", () =>
			saveFilterPreset($state.snapshot(filters)),
		);
	}

	function finishEditing(work: (id: string) => Promise<unknown>) {
		const id = editing?.id;
		editing = null;
		if (id) void run("Failed to update preset", () => work(id));
	}
</script>

<div
	class="-mx-4 flex gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none]"
	role="group"
	aria-label="Filter presets"
>
	{#each presets as preset (preset.id)}
		<Button
			variant="secondary"
			size="sm"
			class={[
				"shrink-0",
				{ [ACTIVE_FILTER]: deepEqual(preset.filters, filters) },
			]}
			onclick={() => onApply(preset.filters)}
			{...longPressHandlers(() => edit(preset))}
		>
			{preset.name}
		</Button>
	{/each}
	{#if !matchesAny && presets.length < maxFilterPresets}
		<Button
			variant="outline"
			size="sm"
			class="shrink-0"
			onclick={saveCurrent}
		>
			<PlusIcon />
			Save preset
		</Button>
	{/if}
</div>
{#if presets.length > 0}
	<span class="pt-1 text-xs text-muted-foreground">
		Hold a preset to rename, overwrite or delete it.
	</span>
{/if}

<Dialog.Root
	bind:open={() => editing !== null, (v: boolean) => !v && (editing = null)}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Edit preset</Dialog.Title>
		</Dialog.Header>
		<Input
			bind:value={draftName}
			aria-label="Preset name"
			maxlength={FILTER_PRESET_NAME_MAX}
			onkeydown={(event: KeyboardEvent) => {
				if (event.key === "Enter") {
					event.preventDefault();
					finishEditing((id) => renameFilterPreset(id, draftName));
				}
			}}
		/>
		<Dialog.Footer class="flex-col gap-2 *:flex-none sm:flex-col">
			{#if editing && !deepEqual(editing.filters, filters)}
				<Button
					variant="secondary"
					onclick={() => {
						const current = $state.snapshot(filters);
						const name = draftName;
						finishEditing(async (id) => {
							await overwriteFilterPreset(id, current);
							await renameFilterPreset(id, name);
						});
					}}
				>
					Overwrite with current filters
				</Button>
			{/if}
			<Button
				onclick={() =>
					finishEditing((id) => renameFilterPreset(id, draftName))}
			>
				Save name
			</Button>
			<Button
				variant="destructive"
				onclick={() => finishEditing(removeFilterPreset)}
			>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
