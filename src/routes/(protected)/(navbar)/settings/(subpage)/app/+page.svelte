<script lang="ts">
	import {
		BroadcastIcon,
		ChecksIcon,
		DeviceMobileIcon,
		ExportIcon,
		EyeIcon,
		HeartIcon,
		LockKeyIcon,
		TrayArrowDownIcon,
		VibrateIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import { desktopEntryAvailable } from "$lib/platform/desktop-entry.svelte";
	import { hapticsAvailable } from "$lib/platform/haptics";
	import {
		updatesSelfManaged,
		updatesUnsupportedReason,
	} from "$lib/updates/capability.svelte";
	import AppsMenuEntrySetting from "./AppsMenuEntrySetting.svelte";
	import AutomaticUpdatesSetting from "./AutomaticUpdatesSetting.svelte";
	import NotificationSettings from "./NotificationSettings.svelte";
	import PreferenceSwitchSetting from "./PreferenceSwitchSetting.svelte";
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
		<PreferenceSwitchSetting
			preference="hapticFeedback"
			title="Haptic feedback"
			description="Short taps as you swipe to reply, switch tabs and pull to refresh."
		>
			{#snippet icon()}
				<VibrateIcon weight="fill" />
			{/snippet}
		</PreferenceSwitchSetting>
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
	<PreferenceSwitchSetting
		preference="stayOnline"
		title="Stay online while the app is open"
		description="Refresh your online status in the background automatically, while the app is open."
	>
		{#snippet icon()}
			<BroadcastIcon weight="fill" />
		{/snippet}
	</PreferenceSwitchSetting>
	<PreferenceSwitchSetting
		preference="revealMessageRead"
		title="Reveal message read status"
		description="Let others know when you've read their messages. Your read receipts remain unaffected."
	>
		{#snippet icon()}
			<ChecksIcon weight="fill" />
		{/snippet}
	</PreferenceSwitchSetting>
	<PreferenceSwitchSetting
		preference="revealProfileViews"
		title="Reveal profile views"
		description="Let others know when you've viewed their profile. Your profile view history remains unaffected."
	>
		{#snippet icon()}
			<EyeIcon weight="fill" />
		{/snippet}
	</PreferenceSwitchSetting>
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

{#if updatesSelfManaged() || updatesUnsupportedReason() !== null}
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
