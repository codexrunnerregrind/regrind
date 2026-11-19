<script lang="ts">
	import { expoOut } from "svelte/easing";
	import { type TransitionConfig } from "svelte/transition";

	import { getGenders } from "#lib/api/users/genders.ts";
	import Button from "#lib/components/ui/button/button.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { compareFilterGenders } from "#lib/model/browse/grid/filters.ts";
	import { instantWhenReducedMotion } from "#lib/util/reduced-motion.ts";
	import FilterDropdown from "./FilterDropdown.svelte";
	import { isGenderChipShown, selectGenders } from "./gender-chips";
	import { selectionSummary } from "./summary";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const genders = $derived(
		getGenders().then((genders) => genders.toSorted(compareFilterGenders)),
	);

	const hide = instantWhenReducedMotion(
		(node: HTMLDivElement): TransitionConfig => {
			const { width } = node.getBoundingClientRect();
			return {
				duration: 400,
				css: (t: number, u: number) =>
					`width: calc(${t} * ${width}px); opacity: ${t}; margin-left: calc(${u} * -4px)`,
				easing: expoOut,
			};
		},
	);

	let expanded = $state(false);

	// The row's summary needs names, which only arrive with the gender list.
	let names: Record<string, string> = $state({});
	$effect(() => {
		void genders.then(
			(list) => {
				names = {
					"-1": t("common.filters.notSpecified"),
					...Object.fromEntries(
						list.map((g) => [
							String(g.genderId),
							g.genderPlural ?? g.gender,
						]),
					),
				};
			},
			() => {},
		);
	});

	const endLabel = $derived(
		selectionSummary(value.map((v) => names[String(v)] ?? String(v))),
	);
</script>

<FilterDropdown
	id="gender"
	label={t("common.filters.genders.label")}
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
							catalog: genders,
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
				<ToggleGroup.Item value="-1">
					{t("common.filters.notSpecified")}
				</ToggleGroup.Item>
				<Button
					variant="secondary"
					onclick={() => (expanded = !expanded)}
				>
					{#if expanded}
						{t("browse.filters.less")}
					{:else}
						{t("browse.filters.more")}
					{/if}
				</Button>
			</ToggleGroup.Root>
		{:catch}
			<div class="text-sm text-destructive">
				{t("common.genders.errors.loadFailed")}
			</div>
		{/await}
	</div>
</FilterDropdown>
