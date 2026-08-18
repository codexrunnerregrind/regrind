<script lang="ts">
	import { untrack } from "svelte";

	import PositionFilterToggle from "$lib/components/filters/position/PositionFilterToggle.svelte";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import type { FilterPositionId } from "$lib/model/browse/grid/filters";

	let {
		open = $bindable(),
		positions,
		onapply,
	}: {
		open: boolean;
		positions: FilterPositionId[];
		onapply: (positions: FilterPositionId[]) => void;
	} = $props();

	// Its own copy until Apply, so picking three positions costs one refetch and
	// not three — the same bargain the grid's position sheet strikes.
	let value = $state<FilterPositionId[]>(untrack(() => [...positions]));

	$effect(() => {
		if (open) untrack(() => (value = [...positions]));
	});

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});
</script>

<Drawer.Root bind:open>
	<Drawer.Content
		preventOverflowTextSelection={false}
		class="mx-auto max-w-160"
	>
		<Drawer.Header class="flex flex-row items-center justify-between">
			<div class="flex flex-1 justify-start">
				<Button
					variant="link"
					class="cursor-pointer"
					onclick={() => (value = [])}
				>
					Reset
				</Button>
			</div>
			<Drawer.Title>Positions</Drawer.Title>
			<div class="flex flex-1 justify-end"></div>
		</Drawer.Header>
		<div class="mb-2 flex flex-col gap-1.5 px-4">
			<PositionFilterToggle bind:value />
		</div>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					onapply([...value]);
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
