<script lang="ts">
	import { VibrateIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getPreferencesSnapshot,
		preferencesLoaded,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";

	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? getPreferencesSnapshot().hapticFeedback);
</script>

<SettingsSwitchRow
	title="Haptic feedback"
	description="Short taps as you swipe to reply, switch tabs and pull to refresh."
	disabled={!preferencesLoaded()}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setPreferences({ hapticFeedback: newValue }).catch((error) => {
				pending = null;
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
>
	{#snippet icon()}
		<VibrateIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
