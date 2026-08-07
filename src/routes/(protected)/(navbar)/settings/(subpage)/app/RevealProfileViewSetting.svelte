<script lang="ts">
	import { EyeIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getPreferencesSnapshot,
		preferencesLoaded,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";

	let pending = $state<boolean | null>(null);
	const value = $derived(
		pending ?? getPreferencesSnapshot().revealProfileViews,
	);
</script>

<SettingsSwitchRow
	title="Reveal profile views"
	description="Let others know when you've viewed their profile. Your profile view history remains unaffected."
	disabled={!preferencesLoaded()}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setPreferences({ revealProfileViews: newValue }).catch((error) => {
				pending = null;
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
>
	{#snippet icon()}
		<EyeIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
