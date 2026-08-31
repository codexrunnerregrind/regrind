<script lang="ts">
	import { DeviceMobileIcon, LockKeyIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import { updatesSelfManaged } from "$lib/updates/capability.svelte";
	import AutomaticUpdatesSetting from "./AutomaticUpdatesSetting.svelte";
	import NotificationSettings from "./NotificationSettings.svelte";
	import RevealMessageReadSetting from "./RevealMessageReadSetting.svelte";
	import RevealProfileViewSetting from "./RevealProfileViewSetting.svelte";
	import StayOnlineSetting from "./StayOnlineSetting.svelte";
	import UnitsSetting from "./UnitsSetting.svelte";

	function unimplemented(feature: string, issue: number) {
		return () => {
			toast(ToastUnimplemented, { componentProps: { feature, issue } });
		};
	}
</script>

<SectionHeader>Display</SectionHeader>
<SettingsGroup divider="full">
	<UnitsSetting />
</SettingsGroup>

<SectionHeader>Notifications</SectionHeader>
<SettingsGroup divider="full">
	<NotificationSettings />
</SettingsGroup>

<SectionHeader>Privacy</SectionHeader>
<SettingsGroup divider="full">
	<StayOnlineSetting />
	<RevealMessageReadSetting />
	<RevealProfileViewSetting />
</SettingsGroup>

<SectionHeader>Security</SectionHeader>
<SettingsGroup>
	<SettingsRow
		title="Discreet app icon"
		description="Disguise ReGrind on your home screen."
		onclick={unimplemented("Discreet app icon", 97)}
	>
		{#snippet icon()}
			<DeviceMobileIcon weight="fill" />
		{/snippet}
	</SettingsRow>
	<SettingsRow
		title="PIN"
		description="Require a passcode to open the app."
		onclick={unimplemented("PIN", 50)}
	>
		{#snippet icon()}
			<LockKeyIcon weight="fill" />
		{/snippet}
	</SettingsRow>
</SettingsGroup>

{#if updatesSelfManaged()}
	<SectionHeader>Updates</SectionHeader>
	<SettingsGroup>
		<AutomaticUpdatesSetting />
	</SettingsGroup>
{/if}
