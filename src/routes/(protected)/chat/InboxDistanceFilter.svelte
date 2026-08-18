<script lang="ts">
	import { untrack } from "svelte";

	import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
	import {
		DISTANCE_METRES_MAX,
		DISTANCE_METRES_MIN,
		DISTANCE_METRES_STEP,
	} from "$lib/chat/conversation-filters.svelte";
	import { buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Slider } from "$lib/components/ui/slider";
	import { Switch } from "$lib/components/ui/switch";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { formatDistance } from "$lib/util/units";

	let {
		open = $bindable(),
		distanceMetres,
		onapply,
	}: {
		open: boolean;
		distanceMetres: number | null;
		onapply: (distanceMetres: number | null) => void;
	} = $props();

	// The sheet edits its own copy, so dragging the slider does not refetch the
	// inbox on every step — only Apply does.
	let enabled = $state(untrack(() => distanceMetres !== null));
	let value = $state([
		untrack(() => distanceMetres) ?? DISTANCE_METRES_MAX / 2,
	]);

	$effect(() => {
		if (open) {
			untrack(() => {
				enabled = distanceMetres !== null;
				value = [distanceMetres ?? DISTANCE_METRES_MAX / 2];
			});
		}
	});

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});

	const label = $derived(
		`Within ${formatDistance(value[0] ?? 0, getUnitsSnapshot())}`,
	);
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
			<Slider
				type="multiple"
				bind:value={
					() => value,
					(v: number[]) => {
						enabled = true;
						value = v;
					}
				}
				min={DISTANCE_METRES_MIN}
				max={DISTANCE_METRES_MAX}
				step={DISTANCE_METRES_STEP}
				thumbLabels={["Maximum distance"]}
			/>
		</div>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					onapply(enabled ? (value[0] ?? null) : null);
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
