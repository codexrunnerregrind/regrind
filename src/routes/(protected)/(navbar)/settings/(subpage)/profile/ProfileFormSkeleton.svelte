<script lang="ts">
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { inlineRowClass, stackedRowClass } from "./fields/row";
	import { maxProfilePhotos } from "./options";

	// Rows per group, in the form's order, so the placeholder holds its shape.
	const groups: {
		title: string;
		rows: ("inline" | "stacked" | "wheel")[];
	}[] = [
		{ title: "About you", rows: ["inline", "stacked", "stacked"] },
		{ title: "Identity", rows: ["stacked", "stacked"] },
		{
			title: "Stats",
			rows: [
				"wheel",
				"inline",
				"inline",
				"inline",
				"inline",
				"inline",
				"inline",
				"inline",
				"inline",
			],
		},
		{
			title: "Preferences",
			rows: ["inline", "inline", "inline", "inline", "inline", "inline"],
		},
		{ title: "Health", rows: ["inline", "inline", "inline", "inline"] },
		{ title: "Social", rows: ["inline", "inline", "inline"] },
	];
</script>

<div data-slot="profile-form-skeleton" class="flex flex-col" aria-hidden="true">
	<SectionHeader>Photos</SectionHeader>
	<SettingsGroup divider="none">
		<div
			data-slot="profile-form-skeleton-photos"
			class="grid grid-cols-3 gap-2 p-3"
		>
			{#each Array.from({ length: maxProfilePhotos })}
				<Skeleton class="aspect-square rounded-xl" />
			{/each}
		</div>
	</SettingsGroup>

	{#each groups as group (group.title)}
		<SectionHeader>{group.title}</SectionHeader>
		<SettingsGroup divider="full">
			{#each group.rows as row, index (index)}
				{#if row === "inline"}
					<div class={inlineRowClass}>
						<Skeleton class="h-4 w-24" />
						<Skeleton class="ms-auto h-4 w-16" />
					</div>
				{:else}
					<div class={stackedRowClass}>
						<Skeleton class="h-3.5 w-20" />
						<Skeleton
							class={[
								"w-full",
								{
									"h-44": row === "wheel",
									"h-9": row !== "wheel",
								},
							]}
						/>
					</div>
				{/if}
			{/each}
		</SettingsGroup>
	{/each}
</div>
