<script lang="ts">
	import {
		AGE_MAX,
		AGE_MIN,
		ageRangeLabel,
	} from "$lib/model/browse/grid/filters";
	import FilterSection from "../FilterSection.svelte";
	import AgeFilterSlider from "./AgeFilterSlider.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const label = $derived(ageRangeLabel(value));
</script>

<FilterSection title="Age" status={checked ? label : undefined}>
	<div class="px-1 pt-1">
		<AgeFilterSlider
			bind:value={
				() => value,
				(v: number[]) => {
					// The full span is no filter at all; anything narrower is.
					checked = v[0] !== AGE_MIN || v[1] !== AGE_MAX;
					value = v;
				}
			}
		/>
	</div>
</FilterSection>
