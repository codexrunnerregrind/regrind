<script lang="ts">
	import BroadcastIcon from "phosphor-svelte/lib/BroadcastIcon";
	import ChecksIcon from "phosphor-svelte/lib/ChecksIcon";
	import ClockIcon from "phosphor-svelte/lib/ClockIcon";
	import DeviceMobileIcon from "phosphor-svelte/lib/DeviceMobileIcon";
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";
	import GifIcon from "phosphor-svelte/lib/GifIcon";
	import HeartIcon from "phosphor-svelte/lib/HeartIcon";
	import LockKeyIcon from "phosphor-svelte/lib/LockKeyIcon";
	import ProhibitIcon from "phosphor-svelte/lib/ProhibitIcon";
	import SparkleIcon from "phosphor-svelte/lib/SparkleIcon";
	import SunIcon from "phosphor-svelte/lib/SunIcon";
	import VibrateIcon from "phosphor-svelte/lib/VibrateIcon";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import PreferenceSwitchSetting from "$lib/components/settings/PreferenceSwitchSetting.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import { appIconAvailable } from "$lib/platform/app-icon";
	import { desktopEntryAvailable } from "$lib/platform/desktop-entry.svelte";
	import { hapticsAvailable } from "$lib/platform/haptics";
	import { keepScreenOnAvailable } from "$lib/platform/keep-screen-on";
	import { addonInstallerAvailable } from "$lib/updates/addon.svelte";
	import {
		updatesSelfManaged,
		updatesUnsupportedReason,
	} from "$lib/updates/capability.svelte";
	import AppsMenuEntrySetting from "./AppsMenuEntrySetting.svelte";
	import AutomaticUpdatesSetting from "./AutomaticUpdatesSetting.svelte";
	import NotificationSettings from "./NotificationSettings.svelte";
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
	<PreferenceSwitchSetting
		preference="gridLastOnline"
		title="Last online"
		description="Show when a profile was last online."
	>
		{#snippet icon()}
			<ClockIcon weight="fill" />
		{/snippet}
	</PreferenceSwitchSetting>
	<PreferenceSwitchSetting
		preference="gridForYou"
		title="For you"
		description="Show recommended profiles inside the grid."
	>
		{#snippet icon()}
			<SparkleIcon weight="fill" />
		{/snippet}
	</PreferenceSwitchSetting>
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
	{#if keepScreenOnAvailable()}
		<PreferenceSwitchSetting
			preference="keepScreenOn"
			title="Keep screen on"
			description="Stop the screen from dimming and locking while the app is open."
		>
			{#snippet icon()}
				<SunIcon weight="fill" />
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
	<PreferenceSwitchSetting
		preference="giphyConsent"
		title="GIF search via GIPHY"
		description="Search and load GIFs from GIPHY in chats. GIPHY sees your IP address, what you search for and that the requests come from a Grindr app."
	>
		{#snippet icon()}
			<GifIcon weight="fill" />
		{/snippet}
	</PreferenceSwitchSetting>
</SettingsGroup>

<SectionHeader>Safety</SectionHeader>
<SettingsGroup divider="full">
	<PreferenceSwitchSetting
		preference="confirmBlock"
		title="Confirm before blocking"
		description="Ask before blocking a profile. Turn off to block with a single tap."
	>
		{#snippet icon()}
			<ProhibitIcon weight="fill" />
		{/snippet}
	</PreferenceSwitchSetting>
</SettingsGroup>

<SectionHeader>Security</SectionHeader>
<SettingsGroup>
	{#if appIconAvailable()}
		<SettingsRow
			title="Discreet app icon"
			description="Disguise ReGrind on your home screen."
			href="/settings/app/app-icon"
		>
			{#snippet icon()}
				<DeviceMobileIcon weight="fill" />
			{/snippet}
		</SettingsRow>
	{/if}
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

{#if updatesSelfManaged() || updatesUnsupportedReason() !== null || addonInstallerAvailable()}
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
