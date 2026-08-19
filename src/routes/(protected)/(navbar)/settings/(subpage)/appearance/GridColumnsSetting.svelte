<script lang="ts">
	import type { SunIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		type GridColumns,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import IconTile from "$lib/components/settings/IconTile.svelte";
	import SettingsSegmented from "$lib/components/settings/SettingsSegmented.svelte";
	import { hapticSelection } from "$lib/platform/haptics";

	let {
		title,
		description,
		icon,
		value,
		save,
	}: {
		title: string;
		description: string;
		icon: typeof SunIcon;
		/** Reads the snapshot, so the control follows the stored preference. */
		value: GridColumns;
		save: (columns: GridColumns) => Parameters<typeof setPreferences>[0];
	} = $props();

	// A write can be in flight while the segment is already lit; the pending
	// value keeps the control from snapping back to the old one and returns to
	// null so the snapshot takes over again.
	let pending = $state<GridColumns | null>(null);
	const current = $derived(pending ?? value);

	const options: { value: `${GridColumns}`; label: string }[] = [
		{ value: "2", label: "2 columns" },
		{ value: "3", label: "3 columns" },
	];
</script>

<div class="flex flex-col gap-3 p-4">
	<div class="flex items-center gap-3.5">
		<IconTile>
			{@const Icon = icon}
			<Icon weight="fill" />
		</IconTile>
		<div class="flex min-w-0 flex-1 flex-col gap-0.5">
			<span class="truncate font-heading text-body font-medium">
				{title}
			</span>
			<span class="text-caption leading-snug text-muted-foreground">
				{description}
			</span>
		</div>
	</div>
	<SettingsSegmented
		{options}
		bind:value={
			() => `${current}`,
			(next: `${GridColumns}`) => {
				const columns = Number(next) as GridColumns;
				if (columns === current) return;
				hapticSelection();
				pending = columns;
				setPreferences(save(columns))
					.catch((error: unknown) => {
						showErrorToast({
							label: "Failed to save preferences",
							error,
						});
					})
					.finally(() => {
						pending = null;
					});
			}
		}
	/>
</div>
