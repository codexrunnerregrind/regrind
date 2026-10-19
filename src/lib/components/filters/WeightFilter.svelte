<script lang="ts">
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import FilterDropdown from "$lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "$lib/components/ui/slider";
	import {
		rangeBoundTexts,
		WEIGHT_KG_MAX,
		WEIGHT_KG_MIN,
	} from "$lib/model/browse/grid/filters";
	import { formatWeightKg } from "$lib/util/units";
	import { WEIGHT_SLIDER_SCALES } from "./slider-scale";
	import { storedAfterMove, WEIGHT_STOPS } from "./unit-stops";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(preferencesSnapshot().units);
	const stops = $derived(WEIGHT_STOPS[units]);
	const shown = $derived(value.map((weightKg) => stops.toStop(weightKg)));
	const [minText, maxText] = $derived(
		rangeBoundTexts({
			floor: WEIGHT_KG_MIN,
			ceiling: WEIGHT_KG_MAX,
			range: value,
			format: formatWeightKg,
			units,
		}),
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
					value[0] !== WEIGHT_KG_MIN || value[1] !== WEIGHT_KG_MAX;
			}
		}
		scale={WEIGHT_SLIDER_SCALES[units]}
		thumbValueTexts={[minText, maxText]}
		thumbLabels={["Minimum weight", "Maximum weight"]}
	/>
</FilterDropdown>
