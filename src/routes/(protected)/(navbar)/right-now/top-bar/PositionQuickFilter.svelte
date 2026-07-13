<script lang="ts">
	import type z from "zod";

	import {
		defaultRightNowFilters,
		filterPositionSchema,
	} from "$lib/components/filters/filters";
	import PositionFilterToggle from "$lib/components/filters/position/PositionFilterToggle.svelte";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Switch } from "$lib/components/ui/switch";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";

	let {
		open = $bindable(),
	}: {
		open: boolean;
	} = $props();

	let filters = $derived({
		...(rightNowState.filters.value ?? defaultRightNowFilters),
	});
	let { positionEnabled: enabled, positions: value } = $derived(filters);

	$effect(() => {
		if (open) {
			filters = { ...(rightNowState.filters.value ?? defaultRightNowFilters) };
		}
	});

	$effect(() => {
		if (open) {
			const onBackGesture = () => {
				open = false;
				return false;
			};
			backGestureEventHandlers.add(onBackGesture);
			return () => {
				backGestureEventHandlers.delete(onBackGesture);
			};
		}
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
					onclick={() => {
						value = defaultRightNowFilters.positions;
					}}
				>
					Reset
				</Button>
			</div>
			<Drawer.Title>Positions</Drawer.Title>
			<div class="flex flex-1 justify-end">
				<Switch id="positions-filter-enabled" bind:checked={enabled} />
			</div>
		</Drawer.Header>
		<div class="mb-2 flex flex-col gap-1.5 px-4">
			<PositionFilterToggle
				bind:value={
					() => value,
					(v: z.infer<typeof filterPositionSchema>) => {
						enabled = true;
						value = v;
					}
				}
			/>
		</div>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					rightNowState.filters.set({
						positionEnabled: enabled,
						positions: value,
					});
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
