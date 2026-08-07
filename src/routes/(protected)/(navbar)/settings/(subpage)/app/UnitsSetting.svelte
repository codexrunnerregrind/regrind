<script lang="ts">
	import { RulerIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getPreferencesSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import IconTile from "$lib/components/settings/IconTile.svelte";
	import SettingsSegmented from "$lib/components/settings/SettingsSegmented.svelte";
	import type { UnitSystem } from "$lib/util/units";

	let pending = $state<UnitSystem | null>(null);
	const value = $derived(pending ?? getPreferencesSnapshot().units);

	const options: { value: UnitSystem; label: string }[] = [
		{ value: "metric", label: "Metric" },
		{ value: "imperial", label: "Imperial" },
	];
</script>

<div class="flex flex-col gap-3 p-4">
	<div class="flex items-center gap-3.5">
		<IconTile>
			<RulerIcon weight="fill" />
		</IconTile>
		<div class="flex min-w-0 flex-1 flex-col gap-0.5">
			<span class="truncate font-heading text-body font-medium"> Units </span>
			<span class="text-caption leading-snug text-muted-foreground">
				How distance, height, and weight are displayed.
			</span>
		</div>
	</div>
	<SettingsSegmented
		{options}
		bind:value={
			() => value,
			(next: string) => {
				const units = (next || "metric") as UnitSystem;
				pending = units;
				setPreferences({ units }).catch((error) => {
					pending = null;
					showErrorToast({
						label: "Failed to save preferences",
						error,
					});
				});
			}
		}
	/>
</div>
