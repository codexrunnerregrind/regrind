<script lang="ts">
	import CalendarBlankIcon from "phosphor-svelte/lib/CalendarBlankIcon";
	import ClockCounterClockwiseIcon from "phosphor-svelte/lib/ClockCounterClockwiseIcon";
	import ExportIcon from "phosphor-svelte/lib/ExportIcon";
	import FloppyDiskIcon from "phosphor-svelte/lib/FloppyDiskIcon";
	import TrayArrowDownIcon from "phosphor-svelte/lib/TrayArrowDownIcon";

	import PreferenceSwitchSetting from "$lib/components/settings/PreferenceSwitchSetting.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
</script>

<SectionHeader>Backup</SectionHeader>
<SettingsGroup divider="full">
	<SettingsRow
		title="Create backup"
		description="Save your saved places and settings to a file."
		href="/settings/advanced/backup"
	>
		{#snippet icon()}
			<FloppyDiskIcon weight="fill" />
		{/snippet}
	</SettingsRow>
	<SettingsRow
		title="Restore from backup"
		description="Pick the places and settings to bring back."
		href="/settings/advanced/restore"
	>
		{#snippet icon()}
			<ClockCounterClockwiseIcon weight="fill" />
		{/snippet}
	</SettingsRow>
</SettingsGroup>

<SectionHeader>Favorites</SectionHeader>
<SettingsGroup divider="full">
	<SettingsRow
		title="Export favorites"
		description="Save your favorites and their notes to a file."
		href="/settings/advanced/favorites/export"
	>
		{#snippet icon()}
			<ExportIcon weight="fill" />
		{/snippet}
	</SettingsRow>
	<SettingsRow
		title="Import favorites"
		description="Add favorites and notes from an exported file."
		href="/settings/advanced/favorites/import"
	>
		{#snippet icon()}
			<TrayArrowDownIcon weight="fill" />
		{/snippet}
	</SettingsRow>
</SettingsGroup>

<SectionHeader>Miscellaneous</SectionHeader>
<SettingsGroup divider="full">
	<PreferenceSwitchSetting
		preference="showAccountCreated"
		title="Account creation date (Experimental)"
		description="Show an estimated creation date at the bottom of profiles."
	>
		{#snippet icon()}
			<CalendarBlankIcon weight="fill" />
		{/snippet}
	</PreferenceSwitchSetting>
</SettingsGroup>
