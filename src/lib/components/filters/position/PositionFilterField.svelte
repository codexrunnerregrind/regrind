<script lang="ts">
	import type z from "zod";

	import PositionFilterToggle from "$lib/components/filters/position/PositionFilterToggle.svelte";
	import {
		FilterPosition,
		type filterPositionSchema,
	} from "$lib/model/browse/grid/filters";
	import FilterDropdown from "../FilterDropdown.svelte";
	import { selectionSummary } from "../summary";

	let {
		value = $bindable(),
		checked = $bindable(),
	}: { value: z.infer<typeof filterPositionSchema>; checked: boolean } =
		$props();

	const LABELS: Record<number, string> = {
		[FilterPosition.Top]: "Top",
		[FilterPosition.VersTop]: "Vers Top",
		[FilterPosition.Versatile]: "Versatile",
		[FilterPosition.VersBottom]: "Vers Bottom",
		[FilterPosition.Bottom]: "Bottom",
		[FilterPosition.Side]: "Side",
		[FilterPosition.NotSpecified]: "Not specified",
	};

	const endLabel = $derived(
		selectionSummary(value.map((v) => LABELS[v] ?? String(v))),
	);
</script>

<FilterDropdown
	id="position"
	label="Position"
	{endLabel}
	bind:checked={
		() => checked,
		(v: boolean) => {
			checked = v;
			if (!v) {
				value = [];
			}
		}
	}
>
	<PositionFilterToggle
		bind:value={
			() => value,
			(v: typeof value) => {
				value = v;
				checked = v.length > 0;
			}
		}
	/>
</FilterDropdown>
