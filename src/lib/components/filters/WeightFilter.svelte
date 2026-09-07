<script lang="ts">
	import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import FilterDropdown from "$lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "$lib/components/ui/slider";
	import {
		WEIGHT_KG_MAX,
		WEIGHT_KG_MIN,
	} from "$lib/model/browse/grid/filters";
	import { formatWeightKg } from "$lib/util/units";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(getPreferencesSnapshot().units);
	const min = $derived(value[0] ?? WEIGHT_KG_MIN);
	const max = $derived(value[1] ?? WEIGHT_KG_MAX);
	const label = $derived(
		`${min === WEIGHT_KG_MIN ? "No min" : formatWeightKg(min, units)} - ${
			max === WEIGHT_KG_MAX ? "No max" : formatWeightKg(max, units)
		}`,
	);
</script>

<FilterDropdown
	id="weight"
	label="Weight"
	bind:checked={
		() => checked,
		(v: boolean) => {
			checked = v;
			if (!v) {
				value = [WEIGHT_KG_MIN, WEIGHT_KG_MAX];
			}
		}
	}
	endLabel={label}
	contentClass="h-8 px-4"
>
	<Slider
		type="multiple"
		bind:value={
			() => value,
			(v: number[]) => {
				// The full span is no filter at all; anything narrower is.
				checked = v[0] !== WEIGHT_KG_MIN || v[1] !== WEIGHT_KG_MAX;
				value = v;
			}
		}
		min={WEIGHT_KG_MIN}
		max={WEIGHT_KG_MAX}
		step={1}
		thumbLabels={["Minimum weight", "Maximum weight"]}
	/>
</FilterDropdown>
