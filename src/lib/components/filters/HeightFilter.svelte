<script lang="ts">
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import FilterDropdown from "$lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "$lib/components/ui/slider";
	import {
		HEIGHT_CM_MAX,
		HEIGHT_CM_MIN,
		rangeBoundTexts,
	} from "$lib/model/browse/grid/filters";
	import { formatHeight } from "$lib/util/units";
	import { HEIGHT_STOPS, storedAfterMove } from "./unit-stops";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(preferencesSnapshot().units);
	const stops = $derived(HEIGHT_STOPS[units]);
	const shown = $derived(value.map((heightCm) => stops.toStop(heightCm)));
	const [minText, maxText] = $derived(
		rangeBoundTexts({
			floor: HEIGHT_CM_MIN,
			ceiling: HEIGHT_CM_MAX,
			range: value,
			format: formatHeight,
			units,
		}),
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
	endLabel={`${minText} - ${maxText}`}
	contentClass="h-8 px-4"
>
	<Slider
		type="multiple"
		bind:value={
			() => shown,
			(moved: number[]) => {
				value = storedAfterMove({ stops, stored: value, moved });
				// The full span is no filter at all; anything narrower is.
				checked =
					value[0] !== HEIGHT_CM_MIN || value[1] !== HEIGHT_CM_MAX;
			}
		}
		min={stops.first}
		max={stops.last}
		step={1}
		thumbValueTexts={[minText, maxText]}
		thumbLabels={["Minimum height", "Maximum height"]}
	/>
</FilterDropdown>
