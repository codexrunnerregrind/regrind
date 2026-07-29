<script lang="ts">
	import { CaretRightIcon, PaletteIcon } from "phosphor-svelte";

	import * as Item from "$lib/components/ui/item";
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<a href="/settings/appearance" {...props}>
			<Item.Media>
				<PaletteIcon weight="fill" class="size-5" />
			</Item.Media>
			<Item.Content class="min-w-0">
				<Item.Title class="inline-block w-full min-w-0 truncate text-left">
					Appearance
				</Item.Title>
			</Item.Content>
			<Item.Actions>
				<CaretRightIcon class="size-4" />
			</Item.Actions>
		</a>
	{/snippet}
</Item.Root>
