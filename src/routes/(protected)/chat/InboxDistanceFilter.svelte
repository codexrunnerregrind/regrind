<script lang="ts">
	import { untrack } from "svelte";

	import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
	import {
		closestMaxDistanceStep,
		DEFAULT_MAX_DISTANCE_STEP,
		maxDistanceLabel,
		maxDistanceMetres,
	} from "$lib/components/filters/distance/distance-steps";
	import DistanceFilterSlider from "$lib/components/filters/distance/DistanceFilterSlider.svelte";
	import { buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Switch } from "$lib/components/ui/switch";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	let {
		open = $bindable(),
		distanceMetres,
		onapply,
	}: {
		open: boolean;
		distanceMetres: number | null;
		onapply: (distanceMetres: number | null) => void;
	} = $props();

	const units = $derived(getUnitsSnapshot());

	// The sheet edits its own copy, so dragging the slider does not refetch the
	// inbox on every step — only Apply does. The value is a step on the scale,
	// not a raw distance: the steps are round numbers in whichever units are set.
	let enabled = $state(untrack(() => distanceMetres !== null));
	let step = $state(DEFAULT_MAX_DISTANCE_STEP);

	$effect(() => {
		if (open) {
			untrack(() => {
				enabled = distanceMetres !== null;
				step =
					distanceMetres === null
						? DEFAULT_MAX_DISTANCE_STEP
						: closestMaxDistanceStep({
								metres: distanceMetres,
								units,
							});
			});
		}
	});

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});

	const label = $derived(maxDistanceLabel({ step, units }));
</script>

<Drawer.Root bind:open>
	<Drawer.Content
		preventOverflowTextSelection={false}
		class="mx-auto max-w-160"
	>
		<Drawer.Header class="flex flex-row items-center justify-between">
			<div class="flex flex-1 justify-start"></div>
			<Drawer.Title>Distance</Drawer.Title>
			<div class="flex flex-1 justify-end">
				<Switch
					aria-label="Filter by distance"
					bind:checked={enabled}
				/>
			</div>
		</Drawer.Header>
		<div class="mb-2 flex flex-col gap-1.5 px-4">
			<div class="mb-2 w-full text-center">{label}</div>
			<DistanceFilterSlider
				bind:value={
					() => step,
					(next: number) => {
						enabled = true;
						step = next;
					}
				}
			/>
		</div>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					onapply(
						enabled ? maxDistanceMetres({ step, units }) : null,
					);
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
