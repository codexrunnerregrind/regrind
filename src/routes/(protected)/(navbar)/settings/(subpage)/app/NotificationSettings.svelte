<script lang="ts">
	import BellSlashIcon from "phosphor-svelte/lib/BellSlashIcon";
	import ChatCircleDotsIcon from "phosphor-svelte/lib/ChatCircleDotsIcon";
	import HandTapIcon from "phosphor-svelte/lib/HandTapIcon";
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getPreferences,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";
	import { notificationAccess } from "$lib/notifications/permission.svelte";
	import { push } from "$lib/notifications/push.svelte";

	let notifyMessages = $state(false);
	let notifyTaps = $state(false);
	let loaded = $state(false);

	const access = $derived(notificationAccess.current);
	// The OS is not going to deliver something the switches say is on. Both
	// halves have to be true for a notification to arrive, and only this one is
	// invisible from in here.
	const withheld = $derived(
		access.loaded && !(access.enabled && access.messages && access.taps),
	);
	const wanted = $derived(loaded && (notifyMessages || notifyTaps));
	// A grant we can still ask for is not a block: the switch prompts. Once
	// Android stops offering the prompt only the settings app can undo it, so
	// the switch would be lying and is disabled instead.
	const messagesLocked = $derived(
		withheld && !access.canPrompt && !access.messages,
	);
	const tapsLocked = $derived(withheld && !access.canPrompt && !access.taps);

	onMount(() => {
		(async () => {
			const prefs = await getPreferences();
			notifyMessages = prefs.notifyMessages;
			notifyTaps = prefs.notifyTaps;
			loaded = true;
		})().catch((e) => {
			console.error("Failed to load preferences", e);
		});
		return notificationAccess.watch();
	});

	function update(
		field: "notifyMessages" | "notifyTaps",
		next: boolean,
		revert: () => void,
	): void {
		(async () => {
			// Turning a notification on is only meaningful if the OS will let us
			// post banners. Prompt on this user gesture while a prompt is still
			// on offer; once it isn't, the row below points at the settings app
			// and the preference stays as the user set it.
			if (next && !access.enabled && access.canPrompt) {
				await notificationAccess.request();
			}
			await setPreferences({ [field]: next });
		})().catch((error) => {
			revert();
			showErrorToast({ label: "Failed to save preferences", error });
		});
	}

	function openSystemSettings(): void {
		if (!access.canOpenSettings) return;
		notificationAccess.openSettings();
	}

	function retryRegistration(): void {
		push.retry()
			.then(() => {
				if (push.registration === "registered")
					toast.success("Registered for notifications");
			})
			.catch(() => {});
	}
</script>

<SettingsSwitchRow
	title="Messages"
	description={messagesLocked
		? "Blocked in your system notification settings."
		: "Get notified when someone sends you a message."}
	disabled={!loaded || messagesLocked}
	bind:checked={
		() => notifyMessages,
		(next: boolean) => {
			const previous = notifyMessages;
			notifyMessages = next;
			update("notifyMessages", next, () => (notifyMessages = previous));
		}
	}
>
	{#snippet icon()}
		<ChatCircleDotsIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
<SettingsSwitchRow
	title="Taps"
	description={tapsLocked
		? "Blocked in your system notification settings."
		: "Get notified when someone taps you."}
	disabled={!loaded || tapsLocked}
	bind:checked={
		() => notifyTaps,
		(next: boolean) => {
			const previous = notifyTaps;
			notifyTaps = next;
			update("notifyTaps", next, () => (notifyTaps = previous));
		}
	}
>
	{#snippet icon()}
		<HandTapIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>

<!-- The switches above are ReGrind's own preference; these rows are the reasons
     a notification still never arrives. Without them the only clue was a line
     in logcat. -->
{#if messagesLocked || tapsLocked}
	<!-- A locked switch cannot be the way out, whether or not the preference
	     behind it is on, so this row is unconditional. -->
	<SettingsRow
		title={access.enabled
			? "Some notifications are turned off"
			: "Notifications are turned off"}
		description={access.canOpenSettings
			? "Your system settings are blocking them. Tap to turn them back on."
			: "Turn notifications on for ReGrind in your system settings."}
		onclick={access.canOpenSettings ? openSystemSettings : undefined}
		external={access.canOpenSettings}
		destructive
	>
		{#snippet icon()}
			<BellSlashIcon weight="fill" />
		{/snippet}
	</SettingsRow>
{:else if withheld && wanted && access.canPrompt}
	<!-- Promptable: the switches still work, so this is only worth saying to
	     someone who has already asked for notifications. -->
	<SettingsRow
		title="Allow notifications"
		description="Your system hasn't granted ReGrind permission yet. Tap to ask."
		onclick={() => void notificationAccess.request()}
	>
		{#snippet icon()}
			<BellSlashIcon weight="fill" />
		{/snippet}
	</SettingsRow>
{/if}
{#if push.registration === "failed"}
	<SettingsRow
		title="This device isn't registered for push"
		description="Grindr couldn't be told where to send your notifications. Tap to try again."
		onclick={retryRegistration}
		destructive
	>
		{#snippet icon()}
			<WarningCircleIcon weight="fill" />
		{/snippet}
	</SettingsRow>
{/if}
