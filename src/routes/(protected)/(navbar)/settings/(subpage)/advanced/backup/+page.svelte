<script lang="ts">
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import {
		backupFilename,
		createBackup,
		portableSettingsCount,
		serializeBackup,
	} from "$lib/backup/backup";
	import { Button } from "$lib/components/ui/button";
	import { saveTextFile } from "$lib/platform/data-file";
	import { reportSaved } from "$lib/platform/save-toast";
	import BackupPartsPicker from "../BackupPartsPicker.svelte";

	let parts = $state({ places: true, settings: true });
	let saving = $state(false);

	const placeCount = $derived(preferencesSnapshot().savedLocations.length);
	const settingsCount = $derived(
		portableSettingsCount(preferencesSnapshot()),
	);
	const anything = $derived(
		(parts.places && placeCount > 0) ||
			(parts.settings && settingsCount > 0),
	);

	const count = (n: number, one: string, many: string) =>
		n === 1 ? `1 ${one}` : `${n} ${many}`;

	async function save() {
		if (saving || !anything) return;
		saving = true;
		const toastId = toast.loading("Saving…");
		try {
			const backup = await createBackup({ ...parts });
			const result = await saveTextFile(
				backupFilename(),
				serializeBackup(backup),
			);
			reportSaved(result, {
				toastId,
				success: "Backup saved",
				errorLabel: "Couldn't back up",
			});
		} catch (caught) {
			console.error(caught);
			toast.dismiss(toastId);
			showErrorToast({ label: "Couldn't back up", error: caught });
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Create backup</title>
</svelte:head>

<p class="pt-1 pb-3.5 text-preview/[1.45] text-pretty text-ink3">
	Choose what goes in the file. Bring it back after a reinstall, or on another
	account, from Restore from backup.
</p>

<BackupPartsPicker
	bind:parts
	verb="Back up"
	disabled={saving}
	details={{
		...(placeCount > 0 && { places: count(placeCount, "place", "places") }),
		settings: count(settingsCount, "setting", "settings"),
	}}
/>

<Button
	class="mt-5 w-full"
	disabled={saving || !anything}
	onclick={() => void save()}
>
	Save backup
</Button>
