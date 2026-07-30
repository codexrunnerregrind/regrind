<script lang="ts">
	import { ChatCircleDotsIcon, HandTapIcon } from "phosphor-svelte";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import {
		getPreferences,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";
	import { notifications } from "$lib/notifications/notifications.svelte";

	let notifyMessages = $state(false);
	let notifyTaps = $state(false);
	let loaded = $state(false);

	onMount(() => {
		(async () => {
			const prefs = await getPreferences();
			notifyMessages = prefs.notifyMessages;
			notifyTaps = prefs.notifyTaps;
			loaded = true;
		})().catch((e) => {
			console.error("Failed to load preferences", e);
		});
	});

	function update(
		field: "notifyMessages" | "notifyTaps",
		next: boolean,
		revert: () => void,
	): void {
		(async () => {
			// Turning a notification on is only meaningful if the OS will let us post
			// banners — prompt for permission on this user gesture and bail if denied.
			if (next && !(await notifications.ensurePermission())) {
				revert();
				toast.error(
					"Notifications are blocked. Enable them for Open Grind in your system settings.",
				);
				return;
			}
			await setPreferences({ [field]: next });
		})().catch((error) => {
			revert();
			showErrorToast({ label: "Failed to save preferences", error });
		});
	}
</script>

<SettingsSwitchRow
	title="Messages"
	description="Get notified when someone sends you a message."
	disabled={!loaded}
	bind:checked={
		() => notifyMessages,
		(next: boolean) => {
			const previous = notifyMessages;
			notifyMessages = next;
			update("notifyMessages", next, () => (notifyMessages = previous));
		}
	}
	tint="blue"
>
	{#snippet icon()}
		<ChatCircleDotsIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
<SettingsSwitchRow
	title="Taps"
	description="Get notified when someone taps you."
	disabled={!loaded}
	bind:checked={
		() => notifyTaps,
		(next: boolean) => {
			const previous = notifyTaps;
			notifyTaps = next;
			update("notifyTaps", next, () => (notifyTaps = previous));
		}
	}
	tint="pink"
>
	{#snippet icon()}
		<HandTapIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
