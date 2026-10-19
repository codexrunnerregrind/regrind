<script lang="ts">
	import FolderLockIcon from "phosphor-svelte/lib/FolderLockIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import SmileyWinkIcon from "phosphor-svelte/lib/SmileyWinkIcon";
	import type z from "zod";

	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import type { filterPhotosSchema } from "$lib/model/browse/grid/filters";
	import FilterDropdown from "./FilterDropdown.svelte";
	import { selectionSummary } from "./summary";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: z.infer<typeof filterPhotosSchema> } =
		$props();

	const LABELS = {
		"has-photos": "Has photos",
		"has-face-pics": "Face pics",
		"has-albums": "Albums",
	} as const;

	const endLabel = $derived(selectionSummary(value.map((v) => LABELS[v])));
</script>

<FilterDropdown
	id="photos"
	label="Photos"
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
	<ToggleGroup.Root
		type="multiple"
		variant="outline"
		spacing={2}
		class="w-full flex-wrap gap-1"
		bind:value={
			() => value,
			(v: typeof value) => ((checked = v.length > 0), (value = v))
		}
	>
		<ToggleGroup.Item value="has-photos">
			<ImageIcon />
			Has photos
		</ToggleGroup.Item>
		<ToggleGroup.Item value="has-face-pics">
			<SmileyWinkIcon />
			Face pics
		</ToggleGroup.Item>
		<ToggleGroup.Item value="has-albums">
			<FolderLockIcon />
			Albums
		</ToggleGroup.Item>
	</ToggleGroup.Root>
</FilterDropdown>
