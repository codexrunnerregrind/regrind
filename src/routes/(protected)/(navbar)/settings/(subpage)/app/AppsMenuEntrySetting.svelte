<script lang="ts">
	import { SquaresFourIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";
	import {
		desktopEntryInstalled,
		setDesktopEntryInstalled,
	} from "$lib/platform/desktop-entry.svelte";

	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? desktopEntryInstalled());
</script>

<SettingsSwitchRow
	title="Show in apps menu"
	description="Add ReGrind to your applications list so it appears in your launcher and gets its icon."
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setDesktopEntryInstalled(newValue)
				.catch((error: unknown) => {
					showErrorToast({
						label: newValue
							? "Couldn't add ReGrind to your apps"
							: "Couldn't remove ReGrind from your apps",
						error,
					});
				})
				.finally(() => (pending = null));
		}
	}
>
	{#snippet icon()}
		<SquaresFourIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
