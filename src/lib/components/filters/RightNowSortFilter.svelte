<script lang="ts">
	import type z from "zod";

	import RadioGroup from "$lib/components/ui/radio/RadioGroup.svelte";
	import RadioItem from "$lib/components/ui/radio/RadioItem.svelte";
	import { RulerIcon, ClockIcon } from "phosphor-svelte";

	import { filterRightNowSortSchema } from "$lib/components/filters/filters";

	let {
		value = $bindable(),
	}: { value: z.infer<typeof filterRightNowSortSchema> } = $props();
</script>

<RadioGroup
	name="sort"
	bind:value={
		() => value,
		(v) => {
			value = v;
		}
	}
>
	<RadioItem value="DISTANCE">
		<div class="flex items-center gap-2 font-semibold">
			<RulerIcon class="size-5" />
			<span>Distance</span>
			<span class="font-normal text-gray-400">(Default)</span>
		</div>
	</RadioItem>

	<RadioItem value="NEWEST">
		<div class="flex items-center gap-2 font-semibold">
			<div class="flex items-center gap-2 font-semibold">
				<ClockIcon class="size-5" />
				<span>Recent</span>
			</div>
		</div>
	</RadioItem>
</RadioGroup>
