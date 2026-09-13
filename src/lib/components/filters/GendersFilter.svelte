<script lang="ts">
	import { expoOut } from "svelte/easing";
	import { type TransitionConfig } from "svelte/transition";

	import { getGenders } from "$lib/api/users/genders";
	import Button from "$lib/components/ui/button/button.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { isFilterableGender } from "$lib/model/browse/grid/filters";
	import FilterDropdown from "./FilterDropdown.svelte";
	import { isGenderChipShown, selectGenders } from "./gender-chips";
	import { selectionSummary } from "./summary";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const genders = $derived(
		getGenders().then((genders) =>
			genders
				.filter(isFilterableGender)
				.sort((a, b) => a.sortFilter - b.sortFilter),
		),
	);

	const hide = (node: HTMLDivElement): TransitionConfig => {
		const width = node.offsetWidth;
		return {
			duration: 400,
			css: (t: number, u: number) =>
				`width: calc(${t} * ${width}px); opacity: ${t}; margin-left: calc(${u} * -4px)`,
			easing: expoOut,
		};
	};

	let expanded = $state(false);

	// The row's summary needs names, which only arrive with the gender list.
	let names: Record<string, string> = $state({});
	$effect(() => {
		void genders.then((list) => {
			names = {
				"-1": "Not specified",
				...Object.fromEntries(
					list.map((g) => [
						String(g.genderId),
						g.genderPlural ?? g.gender,
					]),
				),
			};
		});
	});

	const endLabel = $derived(
		selectionSummary(value.map((v) => names[String(v)] ?? String(v))),
	);
</script>

<FilterDropdown
	id="gender"
	label="Gender"
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
	<div>
		{#await genders}
			<Spinner />
		{:then genders}
			<ToggleGroup.Root
				type="multiple"
				variant="outline"
				spacing={2}
				class="w-full flex-wrap gap-1"
				bind:value={
					() => value.map(String),
					(next: string[]) => {
						value = selectGenders({
							genders,
							previous: value,
							next: next.map(Number),
						});
						checked = value.length > 0;
					}
				}
			>
				{#each genders as gender (gender.genderId)}
					{@const shown = isGenderChipShown({
						gender,
						selected: value,
						expanded,
					})}
					{#if shown}
						<div transition:hide class="overflow-clip">
							<ToggleGroup.Item value={String(gender.genderId)}>
								{gender.genderPlural ?? gender.gender}
							</ToggleGroup.Item>
						</div>
					{/if}
				{/each}
				<ToggleGroup.Item value="-1">Not specified</ToggleGroup.Item>
				<Button
					variant="secondary"
					onclick={() => (expanded = !expanded)}
				>
					{#if expanded}
						Less
					{:else}
						More
					{/if}
				</Button>
			</ToggleGroup.Root>
		{:catch}
			<div class="text-sm text-destructive">Failed to load genders</div>
		{/await}
	</div>
</FilterDropdown>
