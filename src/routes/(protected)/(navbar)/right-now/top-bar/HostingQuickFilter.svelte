<script lang="ts">
	import type z from "zod";

	import {
		defaultRightNowFilters,
		filterHostingSchema,
	} from "$lib/components/filters/filters";
	import HostingFilterToggle from "$lib/components/filters/hosting/HostingFilterToggle.svelte";
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

	let filters = $derived({ ...(rightNowState.filters.value ?? defaultRightNowFilters) });
	let { hostingEnabled: enabled, hosting: value } = $derived(filters);

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
		class="max-w-160 mx-auto"
	>
		<Drawer.Header class="flex flex-row justify-between items-center">
			<div class="flex-1 flex justify-start">
				<Button
					variant="link"
					class="cursor-pointer"
					onclick={() => {
						value = defaultRightNowFilters.hosting;
					}}
				>
					Reset
				</Button>
			</div>
			<Drawer.Title>Hosting Status</Drawer.Title>
			<div class="flex-1 flex justify-end">
				<Switch id="positions-filter-enabled" bind:checked={enabled} />
			</div>
		</Drawer.Header>
		<div class="px-4 flex flex-col gap-1.5 mb-2">
			<HostingFilterToggle
				bind:value={
					() => value,
					(v: z.infer<typeof filterHostingSchema>) => {
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
						hostingEnabled: enabled,
						hosting: value,
					});
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
