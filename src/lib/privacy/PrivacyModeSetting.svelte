<script lang="ts">
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";

	import {
		preferencesLoaded,
		preferencesSnapshot,
	} from "$lib/app-data/preferences.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";
	import { isIosPlatform } from "$lib/platform/os";
	import { imagePrivacy, setImagePrivacy } from "./image-privacy.svelte";

	const enabled = $derived(
		imagePrivacy.override ?? preferencesSnapshot().discreetImages,
	);
	const description = $derived(
		isIosPlatform()
			? "Hold your iPhone face down briefly to turn privacy mode on or off."
			: "Use this switch to turn privacy mode on or off.",
	);
</script>

<SettingsSwitchRow
	title="Enable privacy mode"
	{description}
	disabled={!preferencesLoaded() || imagePrivacy.pending}
	bind:checked={() => enabled, (value) => void setImagePrivacy(value)}
>
	{#snippet icon()}
		<EyeSlashIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
