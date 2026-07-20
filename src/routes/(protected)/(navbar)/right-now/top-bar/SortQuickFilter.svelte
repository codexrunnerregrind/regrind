<script lang="ts">
	import type z from "zod";

	import {
		defaultRightNowFilters,
		filterRightNowSortSchema,
	} from "$lib/components/filters/filters";
	import RightNowSortFilter from "$lib/components/filters/RightNowSortFilter.svelte";
	import { buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
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
	let { sort: value } = $derived(filters);

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
			<div class="flex flex-1 justify-start"></div>
			<Drawer.Title>Sort</Drawer.Title>
			<div class="flex flex-1 justify-end"></div>
		</Drawer.Header>
		<div class="mb-2 flex flex-col gap-1.5 px-4">
			<RightNowSortFilter
				bind:value={
					() => value,
					(v: z.infer<typeof filterRightNowSortSchema>) => {
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
						sort: value,
					});
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
