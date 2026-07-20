<script lang="ts">
	import AgeFilterSlider from "$lib/components/filters/age/AgeFilterSlider.svelte";
	import { defaultRightNowFilters } from "$lib/components/filters/filters";
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
	let { ageEnabled: enabled, age: value } = $derived(filters);

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

	let label = $state("");
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
						value = defaultRightNowFilters.age;
					}}
				>
					Reset
				</Button>
			</div>
			<Drawer.Title>Age</Drawer.Title>
			<div class="flex flex-1 justify-end">
				<Switch id="age-filter-enabled" bind:checked={enabled} />
			</div>
		</Drawer.Header>
		<div class="mb-2 flex flex-col gap-1.5 px-4">
			<div class="mb-2 w-full text-center">{label}</div>
			<AgeFilterSlider
				bind:value={
					() => value,
					(v: number[]) => {
						enabled = true;
						value = v;
					}
				}
				bind:label
			/>
		</div>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					rightNowState.filters.set({
						ageEnabled: enabled,
						age: value,
					});
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
