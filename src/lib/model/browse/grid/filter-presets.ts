import z from "zod";

import {
	ageRangeLabel,
	countActiveFilters,
	type GridSearchFilters,
	gridSearchFiltersSchema,
} from "./filters";

export const FILTER_PRESET_NAME_MAX = 40;
export const maxFilterPresets = 8;

export const gridFilterPresetSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(FILTER_PRESET_NAME_MAX),
	filters: gridSearchFiltersSchema,
});

export type GridFilterPreset = z.infer<typeof gridFilterPresetSchema>;

const NAMED_TOGGLES = [
	["isFavorite", "Favorites"],
	["isOnline", "Online"],
	["isRightNow", "Right now"],
	["isFresh", "Fresh"],
] as const;

/** A default name from the filters it saves, e.g. "Online · 18 - 30 · +2". */
export function derivePresetName({
	filters,
	taken,
}: {
	filters: GridSearchFilters;
	taken: string[];
}): string {
	const parts: string[] = NAMED_TOGGLES.filter(([key]) => filters[key]).map(
		([, label]) => label,
	);
	if (filters.ageEnabled) parts.push(ageRangeLabel(filters.age));
	const rest = countActiveFilters(filters) - parts.length;
	if (rest > 0) parts.push(`+${rest}`);
	const base = (parts.join(" · ") || "All profiles").slice(
		0,
		FILTER_PRESET_NAME_MAX - 3,
	);
	let name = base;
	for (let n = 2; taken.includes(name); n++) name = `${base} ${n}`;
	return name;
}
