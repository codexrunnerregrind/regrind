<script lang="ts">
	import { untrack } from "svelte";

	import AgeFilterSlider from "#lib/components/filters/age/AgeFilterSlider.svelte";
	import { Button, buttonVariants } from "#lib/components/ui/button/index.ts";
	import * as Drawer from "#lib/components/ui/drawer/index.ts";
	import { Switch } from "#lib/components/ui/switch/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import {
		AGE_MAX,
		AGE_MIN,
		ageRangeLabel,
	} from "#lib/model/browse/grid/filters.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";

	type AgeFilters = { ageEnabled: boolean; age: number[] };

	let {
		open = $bindable(),
		filters,
	}: {
		open: boolean;
		filters: { snapshot(): AgeFilters; set(patch: AgeFilters): void };
	} = $props();

	let draft = $state(untrack(() => filters.snapshot()));
	let { ageEnabled: enabled, age: value } = $derived(draft);

	$effect(() => {
		if (open) {
			draft = untrack(() => filters.snapshot());
		}
	});

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});

	const label = $derived(ageRangeLabel(value));
</script>

<Drawer.Root bind:open>
	<Drawer.Content class="mx-auto max-w-160">
		<Drawer.Header class="flex flex-row items-center justify-between">
			<div class="flex flex-1 justify-start">
				<Button
					variant="link"
					class="cursor-pointer"
					onclick={() => {
						value = [AGE_MIN, AGE_MAX];
					}}
				>
					{t("browse.filters.reset")}
				</Button>
			</div>
			<Drawer.Title>{t("common.filters.age.label")}</Drawer.Title>
			<div class="flex flex-1 justify-end">
				<Switch
					aria-label={t("browse.filters.age.a11y.toggle")}
					bind:checked={enabled}
				/>
			</div>
		</Drawer.Header>
		<Drawer.Body class="mb-2 flex flex-col gap-1.5 px-4">
			<div class="mb-2 w-full text-center">{label}</div>
			<AgeFilterSlider
				bind:value={
					() => value,
					(v: number[]) => {
						enabled = true;
						value = v;
					}
				}
			/>
		</Drawer.Body>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					filters.set({ ageEnabled: enabled, age: value });
					open = false;
				}}
			>
				{t("browse.filters.apply")}
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
