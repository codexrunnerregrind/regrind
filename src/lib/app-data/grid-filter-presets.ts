import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	derivePresetName,
	FILTER_PRESET_NAME_MAX,
	type GridFilterPreset,
	maxFilterPresets,
} from "$lib/model/browse/grid/filter-presets";
import type { GridSearchFilters } from "$lib/model/browse/grid/filters";

async function update(
	mutate: (presets: GridFilterPreset[]) => GridFilterPreset[],
): Promise<void> {
	const { gridFilterPresets } = await getPreferences();
	await setPreferences({ gridFilterPresets: mutate(gridFilterPresets) });
}

/** Saves the filters as a new preset and returns its id. */
export async function saveFilterPreset(
	filters: GridSearchFilters,
): Promise<string> {
	const { gridFilterPresets } = await getPreferences();
	if (gridFilterPresets.length >= maxFilterPresets) {
		throw new Error("Too many filter presets");
	}
	const id = crypto.randomUUID();
	const name = derivePresetName({
		filters,
		taken: gridFilterPresets.map((preset) => preset.name),
	});
	await update((presets) => [
		...presets,
		{ id, name, filters: structuredClone(filters) },
	]);
	return id;
}

export async function renameFilterPreset(
	id: string,
	name: string,
): Promise<void> {
	const trimmed = name.trim().slice(0, FILTER_PRESET_NAME_MAX);
	if (!trimmed) return;
	await update((presets) =>
		presets.map((preset) =>
			preset.id === id ? { ...preset, name: trimmed } : preset,
		),
	);
}

export async function overwriteFilterPreset(
	id: string,
	filters: GridSearchFilters,
): Promise<void> {
	await update((presets) =>
		presets.map((preset) =>
			preset.id === id
				? { ...preset, filters: structuredClone(filters) }
				: preset,
		),
	);
}

export async function removeFilterPreset(id: string): Promise<void> {
	await update((presets) => presets.filter((preset) => preset.id !== id));
}
