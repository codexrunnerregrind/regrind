<script lang="ts">
	import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import FilterDropdown from "$lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "$lib/components/ui/slider";
	import {
		HEIGHT_CM_MAX,
		HEIGHT_CM_MIN,
	} from "$lib/model/browse/grid/filters";
	import { formatHeight } from "$lib/util/units";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(getPreferencesSnapshot().units);
	const min = $derived(value[0] ?? HEIGHT_CM_MIN);
	const max = $derived(value[1] ?? HEIGHT_CM_MAX);
	const label = $derived(
		`${min === HEIGHT_CM_MIN ? "No min" : formatHeight(min, units)} - ${
			max === HEIGHT_CM_MAX ? "No max" : formatHeight(max, units)
		}`,
	);
</script>

<FilterDropdown
	id="height"
	label="Height"
	bind:checked={
		() => checked,
		(v: boolean) => {
			checked = v;
			if (!v) {
				value = [HEIGHT_CM_MIN, HEIGHT_CM_MAX];
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
				checked = v[0] !== HEIGHT_CM_MIN || v[1] !== HEIGHT_CM_MAX;
				value = v;
			}
		}
		min={HEIGHT_CM_MIN}
		max={HEIGHT_CM_MAX}
		step={1}
		thumbLabels={["Minimum height", "Maximum height"]}
	/>
</FilterDropdown>
