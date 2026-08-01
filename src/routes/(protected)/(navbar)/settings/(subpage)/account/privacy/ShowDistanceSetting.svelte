<script lang="ts">
	import { MapPinIcon } from "phosphor-svelte";
	import { onMount } from "svelte";

	import { showErrorToast } from "$lib/api/error";
	import { getProfile, patchOwnProfile } from "$lib/api/users/profiles";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	let value = $state(false);
	let loaded = $state(false);

	onMount(() => {
		getProfile(ourProfileId)
			.then((profile) => {
				value = profile.showDistance;
				loaded = true;
			})
			.catch((e) => {
				console.error("Failed to load profile", e);
			});
	});
</script>

<SettingsSwitchRow
	title="Show my distance"
	description="Reveal your approximate location to other users as distance, e.g. 1.2 km."
	disabled={!loaded}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			if (!loaded) return;
			const previous = value;
			value = newValue;
			void patchOwnProfile(ourProfileId, { showDistance: newValue }).catch(
				(error) => {
					value = previous;
					showErrorToast({ label: "Failed to update setting", error });
				},
			);
		}
	}
	tint="orange"
>
	{#snippet icon()}
		<MapPinIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
