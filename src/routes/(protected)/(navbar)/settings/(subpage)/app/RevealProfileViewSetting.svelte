<script lang="ts">
	import { EyeIcon } from "phosphor-svelte";
	import { onMount } from "svelte";

	import { showErrorToast } from "$lib/api/error";
	import {
		getPreferences,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";

	let value = $state(false);
	let loaded = $state(false);

	onMount(() => {
		(async () => {
			const { revealProfileViews } = await getPreferences();
			value = revealProfileViews;
			loaded = true;
		})().catch((e) => {
			console.error("Failed to load preferences", e);
		});
	});
</script>

<SettingsSwitchRow
	title="Reveal profile views"
	description="Let others know when you've viewed their profile. Your profile view history remains unaffected."
	disabled={!loaded}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			const previous = value;
			value = newValue;
			setPreferences({ revealProfileViews: newValue }).catch((error) => {
				value = previous;
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
	tint="indigo"
>
	{#snippet icon()}
		<EyeIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
