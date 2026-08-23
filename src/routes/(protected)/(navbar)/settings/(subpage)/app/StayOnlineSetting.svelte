<script lang="ts">
	import { BroadcastIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getPreferencesSnapshot,
		preferencesLoaded,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";

	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? getPreferencesSnapshot().stayOnline);
</script>

<SettingsSwitchRow
	title="Stay online while the app is open"
	description="Refresh your online status in the background automatically, while the app is open."
	disabled={!preferencesLoaded()}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setPreferences({ stayOnline: newValue }).catch((error) => {
				pending = null;
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
>
	{#snippet icon()}
		<BroadcastIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
