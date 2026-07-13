<script lang="ts">
	import { HouseIcon } from "phosphor-svelte";
	import type z from "zod";

	import {
        filterHostingSchema
	} from "$lib/components/filters/filters";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";

	let { value = $bindable() }: { value: z.infer<typeof filterHostingSchema> } =
		$props();
</script>

<ToggleGroup.Root
	type="single"
	variant="outline"
	spacing={2}
	class="flex-wrap w-full gap-1"
	bind:value={
		() => String(value),
		(v: string[]) => {
            console.log('>>', v, typeof v, Boolean(v))
            value = filterHostingSchema.parse(Boolean(v))
            return value;
        }
	}
>
	<ToggleGroup.Item value="true">
		<HouseIcon />
		Hosting
	</ToggleGroup.Item>
</ToggleGroup.Root>
