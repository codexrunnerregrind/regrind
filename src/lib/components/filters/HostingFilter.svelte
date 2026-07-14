<script lang="ts">
	import type z from "zod";

	import RadioGroup from "$lib/components/ui/radio/RadioGroup.svelte";
	import RadioItem from "$lib/components/ui/radio/RadioItem.svelte";
	import { HouseIcon } from "phosphor-svelte";

	import { filterHostingSchema } from "$lib/components/filters/filters";

	let { value = $bindable() }: { value: z.infer<typeof filterHostingSchema> } =
		$props();
</script>

<RadioGroup
	name="hosting"
	bind:value={
		() => String(value),
		(v) => {
			value = v === "true";
		}
	}
>
	<RadioItem value="true">
		<div class="flex items-center gap-2 font-semibold">
			<HouseIcon class="size-5" weight="fill" />
			<span>Hosting</span>
		</div>
	</RadioItem>

	<RadioItem value="false">
		<div class="flex items-center gap-2 font-semibold">
			<div
				class="relative inline-flex items-center justify-center overflow-hidden"
			>
				<HouseIcon class="size-5" weight="fill" />
				<div
					class="pointer-events-none absolute inset-0 flex items-center justify-center"
				>
					<span class="h-[2px] w-[141%] rotate-45 bg-white mix-blend-difference"
					></span>
				</div>
			</div>
			<span>Not Hosting</span>
		</div>
	</RadioItem>
</RadioGroup>
