<script lang="ts">
	import CalendarBlankIcon from "phosphor-svelte/lib/CalendarBlankIcon";
	import ExportIcon from "phosphor-svelte/lib/ExportIcon";
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";
	import MapPinPlusIcon from "phosphor-svelte/lib/MapPinPlusIcon";
	import TrayArrowDownIcon from "phosphor-svelte/lib/TrayArrowDownIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSavedLocationsSnapshot } from "$lib/app-data/preferences.svelte";
	import {
		buildSavedPlacesExport,
		importSavedPlaces,
		parseSavedPlacesExport,
		savedPlacesExportFilename,
		SavedPlacesImportError,
		serializeSavedPlacesExport,
	} from "$lib/app-data/saved-locations-transfer";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import {
		pickTextFile,
		type SaveFileResult,
		saveTextFile,
	} from "$lib/platform/data-file";
	import PreferenceSwitchSetting from "../app/PreferenceSwitchSetting.svelte";

	let busy = $state(false);

	const plural = (count: number) =>
		count === 1 ? "1 place" : `${count} places`;

	// iOS may need a fresh tap before the share sheet opens.
	function report(
		result: SaveFileResult,
		count: number,
		toastId: string | number,
	): void {
		const shareAgain = result.shareFromGesture;
		if (shareAgain !== undefined) {
			toast.info("Ready to save", {
				id: toastId,
				description: "Tap to choose where it goes.",
				duration: Infinity,
				action: {
					label: "Save",
					onClick: () => {
						const next = toast.loading("Saving…");
						shareAgain()
							.then((again) => report(again, count, next))
							.catch((caught: unknown) => {
								toast.dismiss(next);
								showErrorToast({
									label: "Couldn't export saved places",
									error: caught,
								});
							});
					},
				},
			});
			return;
		}
		if (result.cancelled) {
			toast.dismiss(toastId);
			return;
		}
		toast.success(`Exported ${plural(count)}`, { id: toastId });
	}

	async function exportPlaces() {
		if (busy) return;
		const data = buildSavedPlacesExport(getSavedLocationsSnapshot());
		if (data.places.length === 0) {
			toast.info("You have no saved places yet");
			return;
		}
		busy = true;
		const toastId = toast.loading("Saving…");
		try {
			const result = await saveTextFile(
				savedPlacesExportFilename(),
				serializeSavedPlacesExport(data),
			);
			report(result, data.places.length, toastId);
		} catch (caught) {
			console.error(caught);
			toast.dismiss(toastId);
			showErrorToast({
				label: "Couldn't export saved places",
				error: caught,
			});
		} finally {
			busy = false;
		}
	}

	async function importPlaces() {
		if (busy) return;
		busy = true;
		try {
			const text = await pickTextFile();
			if (text === null) return;
			const data = parseSavedPlacesExport(text);
			if (data.places.length === 0) {
				toast.info("That export has no saved places in it");
				return;
			}
			const { added, existing, skipped } = await importSavedPlaces(data);
			const parts = [
				existing > 0 ? `${plural(existing)} already saved` : null,
				skipped > 0 ? `${skipped} over the limit` : null,
			].filter((part) => part !== null);
			const label = `Added ${plural(added)}`;
			if (skipped > 0) {
				toast.warning(`${label} — ${parts.join(", ")}`);
			} else {
				toast.success(
					parts.length > 0 ? `${label} — ${parts.join(", ")}` : label,
				);
			}
		} catch (caught) {
			console.error(caught);
			if (caught instanceof SavedPlacesImportError) {
				toast.error(caught.message);
			} else {
				showErrorToast({
					label: "Couldn't import saved places",
					error: caught,
				});
			}
		} finally {
			busy = false;
		}
	}
</script>

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
		onclick={() => void importPlaces()}
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
