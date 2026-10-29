<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		type BooleanPreference,
		preferencesLoaded,
		preferencesSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";

	let {
		preference,
		title,
		description,
		icon,
	}: {
		preference: BooleanPreference;
		title: string;
		description: string;
		icon?: import("svelte").Snippet;
	} = $props();

	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? preferencesSnapshot()[preference]);
</script>

<SettingsSwitchRow
	{title}
	{description}
	{icon}
	disabled={!preferencesLoaded()}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setPreferences({ [preference]: newValue }).catch((error) => {
				pending = null;
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
/>
