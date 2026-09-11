<script lang="ts">
	import {
		DeviceMobileIcon,
		ExportIcon,
		HeartIcon,
		LockKeyIcon,
		TrayArrowDownIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import { desktopEntryAvailable } from "$lib/platform/desktop-entry.svelte";
	import { hapticsAvailable } from "$lib/platform/haptics";
	import { updatesSelfManaged } from "$lib/updates/capability.svelte";
	import AppsMenuEntrySetting from "./AppsMenuEntrySetting.svelte";
	import AutomaticUpdatesSetting from "./AutomaticUpdatesSetting.svelte";
	import HapticFeedbackSetting from "./HapticFeedbackSetting.svelte";
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
	{#if hapticsAvailable()}
		<HapticFeedbackSetting />
	{/if}
	{#if desktopEntryAvailable()}
		<AppsMenuEntrySetting />
	{/if}
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

<SectionHeader>Advanced</SectionHeader>
<SettingsGroup divider="full">
	<SettingsRow
		title="Export favorites"
		description="Save your favorites and their notes to a file."
		href="/settings/app/favorites/export"
	>
		{#snippet icon()}
			<ExportIcon weight="fill" />
		{/snippet}
	</SettingsRow>
	<SettingsRow
		title="Import favorites"
		description="Restore favorites and notes from an exported file."
		href="/settings/app/favorites/import"
	>
		{#snippet icon()}
			<TrayArrowDownIcon weight="fill" />
		{/snippet}
	</SettingsRow>
</SettingsGroup>

{#if updatesSelfManaged()}
	<SectionHeader>Updates</SectionHeader>
	<SettingsGroup>
		<AutomaticUpdatesSetting />
	</SettingsGroup>
{/if}

<SectionHeader>About</SectionHeader>
<SettingsGroup>
	<SettingsRow title="Credits & Licenses" href="/settings/app/credits">
		{#snippet icon()}
			<HeartIcon weight="fill" />
		{/snippet}
	</SettingsRow>
</SettingsGroup>
