<script lang="ts">
	import { showErrorToast } from "#lib/api/error-toast.ts";
	import {
		type BooleanPreference,
		preferencesLoaded,
		preferencesSnapshot,
		setPreferences,
	} from "#lib/app-data/preferences.svelte.ts";
	import SettingsSwitchRow from "#lib/components/settings/SettingsSwitchRow.svelte";
	import { t } from "#lib/i18n/index.ts";

	let {
		id,
		preference,
		title,
		description,
		icon,
		disabled = false,
	}: {
		/** Anchor for links that land on this setting. */
		id?: string;
		preference: BooleanPreference;
		title: string;
		description: string;
		icon?: import("svelte").Snippet;
		disabled?: boolean;
	} = $props();

	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? preferencesSnapshot()[preference]);
</script>

{#snippet row()}
	<SettingsSwitchRow
		{title}
		{description}
		{icon}
		disabled={disabled || !preferencesLoaded()}
		bind:checked={
			() => value,
			(newValue: boolean) => {
				pending = newValue;
				setPreferences({ [preference]: newValue }).catch((error) => {
					pending = null;
					showErrorToast({
						label: t("settings.setting.errors.saveFailed"),
						error,
					});
				});
			}
		}
	/>
{/snippet}

{#if id === undefined}
	{@render row()}
{:else}
	<div {id} class="scroll-mt-4">
		{@render row()}
	</div>
{/if}
