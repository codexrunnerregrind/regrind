<script lang="ts">
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";

	import { preferencesLoaded } from "$lib/app-data/preferences.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";
	import { isIosPlatform } from "$lib/platform/os";
	import {
		imagePrivacy,
		privacyFeatureOn,
		setPrivacyFeature,
	} from "./image-privacy.svelte";

	const description = $derived(
		isIosPlatform()
			? "Hides images. Hold your iPhone face down briefly, or use the floating button, to show or hide them."
			: "Hides images. Use the floating button to show or hide them.",
	);
</script>

<SettingsSwitchRow
	title="Enable privacy mode"
	{description}
	disabled={!preferencesLoaded() || imagePrivacy.pending}
	bind:checked={
		() => privacyFeatureOn(), (value) => void setPrivacyFeature(value)
	}
>
	{#snippet icon()}
		<EyeSlashIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
