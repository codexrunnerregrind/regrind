<script lang="ts">
	import { ChecksIcon } from "phosphor-svelte";
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
			const { revealMessageRead } = await getPreferences();
			value = revealMessageRead;
			loaded = true;
		})().catch((e) => {
			console.error("Failed to load preferences", e);
		});
	});
</script>

<SettingsSwitchRow
	title="Reveal message read status"
	description="Let others know when you've read their messages. Your read receipts remain unaffected."
	disabled={!loaded}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			const previous = value;
			value = newValue;
			setPreferences({ revealMessageRead: newValue }).catch((error) => {
				value = previous;
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
	tint="blue"
>
	{#snippet icon()}
		<ChecksIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
