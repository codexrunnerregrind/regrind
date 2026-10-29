<script lang="ts">
	import GearIcon from "phosphor-svelte/lib/GearIcon";
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";

	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import type { BackupParts } from "$lib/backup/backup";

	let {
		parts = $bindable(),
		details,
		verb,
		disabled = false,
	}: {
		parts: BackupParts;
		/** A part is listed only when it has a detail line. */
		details: Partial<Record<keyof BackupParts, string>>;
		/** For the checkbox labels, e.g. "Back up". */
		verb: string;
		disabled?: boolean;
	} = $props();

	const titles: Record<keyof BackupParts, string> = {
		places: "Saved places",
		settings: "Settings",
	};
	const keys = ["places", "settings"] as const;
</script>

<SettingsGroup divider="full">
	{#each keys as key (key)}
		{@const detail = details[key]}
		{#if detail !== undefined}
			<SettingsRow
				as="label"
				title={titles[key]}
				description={detail}
				{disabled}
			>
				{#snippet icon()}
					{#if key === "places"}
						<MapPinIcon weight="fill" />
					{:else}
						<GearIcon weight="fill" />
					{/if}
				{/snippet}
				{#snippet trailing()}
					<Checkbox
						checked={parts[key]}
						{disabled}
						onCheckedChange={(value) =>
							(parts[key] = value === true)}
						aria-label="{verb} {titles[key].toLowerCase()}"
					/>
				{/snippet}
			</SettingsRow>
		{/if}
	{/each}
</SettingsGroup>
