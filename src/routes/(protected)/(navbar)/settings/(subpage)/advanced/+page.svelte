<script lang="ts">
	import CalendarBlankIcon from "phosphor-svelte/lib/CalendarBlankIcon";
	import ClockCounterClockwiseIcon from "phosphor-svelte/lib/ClockCounterClockwiseIcon";
	import ExportIcon from "phosphor-svelte/lib/ExportIcon";
	import FloppyDiskIcon from "phosphor-svelte/lib/FloppyDiskIcon";
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";
	import MapPinPlusIcon from "phosphor-svelte/lib/MapPinPlusIcon";
	import TrayArrowDownIcon from "phosphor-svelte/lib/TrayArrowDownIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSavedLocationsSnapshot } from "$lib/app-data/preferences.svelte";
	import {
		buildSavedPlacesExport,
		savedPlacesExportFilename,
		serializeSavedPlacesExport,
	} from "$lib/app-data/saved-locations-transfer";
	import {
		backupFilename,
		createBackup,
		serializeBackup,
	} from "$lib/backup/backup";
	import PreferenceSwitchSetting from "$lib/components/settings/PreferenceSwitchSetting.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import { saveTextFile } from "$lib/platform/data-file";
	import { reportSaved } from "$lib/platform/save-toast";

	let busy = $state(false);

	async function save({
		filename,
		text,
		success,
		errorLabel,
	}: {
		filename: string;
		text: () => Promise<string>;
		success: string;
		errorLabel: string;
	}) {
		if (busy) return;
		busy = true;
		const toastId = toast.loading("Saving…");
		try {
			const result = await saveTextFile(filename, await text());
			reportSaved(result, { toastId, success, errorLabel });
		} catch (caught) {
			console.error(caught);
			toast.dismiss(toastId);
			showErrorToast({ label: errorLabel, error: caught });
		} finally {
			busy = false;
		}
	}

	function exportPlaces() {
		const data = buildSavedPlacesExport(getSavedLocationsSnapshot());
		const count = data.places.length;
		if (count === 0) {
			toast.info("You have no saved places yet");
			return;
		}
		return save({
			filename: savedPlacesExportFilename(),
			text: () => Promise.resolve(serializeSavedPlacesExport(data)),
			success:
				count === 1 ? "Exported 1 place" : `Exported ${count} places`,
			errorLabel: "Couldn't export saved places",
		});
	}

	function backUp() {
		return save({
			filename: backupFilename(),
			text: async () => serializeBackup(await createBackup()),
			success: "Backup saved",
			errorLabel: "Couldn't back up",
		});
	}
</script>

<SectionHeader>Backup</SectionHeader>
<SettingsGroup divider="full">
	<SettingsRow
		title="Back up everything"
		description="Save your favorites, saved places and settings to one file."
		onclick={() => void backUp()}
		disabled={busy}
	>
		{#snippet icon()}
			<FloppyDiskIcon weight="fill" />
		{/snippet}
	</SettingsRow>
	<SettingsRow
		title="Restore from backup"
		description="Bring them back on a new install or another account."
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
		description="Restore favorites and notes from an exported file."
		href="/settings/advanced/favorites/import"
	>
		{#snippet icon()}
			<TrayArrowDownIcon weight="fill" />
		{/snippet}
	</SettingsRow>
</SettingsGroup>

<SectionHeader>Saved places</SectionHeader>
<SettingsGroup divider="full">
	<SettingsRow
		title="Export saved places"
		description="Save your saved and recent locations to a file."
		onclick={() => void exportPlaces()}
	>
		{#snippet icon()}
			<MapPinIcon weight="fill" />
		{/snippet}
	</SettingsRow>
	<SettingsRow
		title="Import saved places"
		description="Add locations from an exported file. Nothing is removed."
		href="/settings/advanced/places/import"
	>
		{#snippet icon()}
			<MapPinPlusIcon weight="fill" />
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
