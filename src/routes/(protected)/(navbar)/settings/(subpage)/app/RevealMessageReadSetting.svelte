<script lang="ts">
	import { ChecksIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getPreferencesSnapshot,
		preferencesLoaded,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";

	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? getPreferencesSnapshot().revealMessageRead);
</script>

<SettingsSwitchRow
	title="Reveal message read status"
	description="Let others know when you've read their messages. Your read receipts remain unaffected."
	disabled={!preferencesLoaded()}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setPreferences({ revealMessageRead: newValue }).catch((error) => {
				pending = null;
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
>
	{#snippet icon()}
		<ChecksIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
