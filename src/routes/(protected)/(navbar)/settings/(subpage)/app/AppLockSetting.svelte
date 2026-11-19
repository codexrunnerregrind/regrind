<script lang="ts">
	import LockKeyIcon from "phosphor-svelte/lib/LockKeyIcon";
	import TimerIcon from "phosphor-svelte/lib/TimerIcon";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import {
		type AppLockAfter,
		preferencesLoaded,
		preferencesSnapshot,
		setPreferences,
	} from "#lib/app-data/preferences.svelte.ts";
	import IconTile from "#lib/components/settings/IconTile.svelte";
	import SettingsSegmented from "#lib/components/settings/SettingsSegmented.svelte";
	import SettingsSwitchRow from "#lib/components/settings/SettingsSwitchRow.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { setAppLock } from "#lib/platform/app-lock.svelte.ts";

	let pending = $state<boolean | null>(null);
	const on = $derived(pending ?? preferencesSnapshot().appLock);

	const options: { value: `${AppLockAfter}`; label: string }[] = $derived([
		{ value: "0", label: t("settings.app.appLock.after.now") },
		{ value: "60", label: t("settings.app.appLock.after.oneMinute") },
		{ value: "300", label: t("settings.app.appLock.after.fiveMinutes") },
		{ value: "900", label: t("settings.app.appLock.after.fifteenMinutes") },
	]);
	let pendingAfter = $state<AppLockAfter | null>(null);
	const after = $derived(pendingAfter ?? preferencesSnapshot().appLockAfter);
</script>

<SettingsSwitchRow
	title={t("settings.app.appLock.title")}
	description={t("settings.app.appLock.description")}
	disabled={!preferencesLoaded() || pending !== null}
	bind:checked={
		() => on,
		(next: boolean) => {
			pending = next;
			setAppLock(next)
				.catch((error: unknown) => {
					// Cancelling the prompt just leaves it off.
					if (next) return;
					showErrorToast({
						label: t("settings.setting.errors.saveFailed"),
						error,
					});
				})
				.finally(() => {
					pending = null;
				});
		}
	}
>
	{#snippet icon()}
		<LockKeyIcon weight="fill" />
	{/snippet}
</SettingsSwitchRow>
{#if on}
	<div class="flex flex-col gap-3 p-4">
		<div class="flex items-center gap-3.5">
			<IconTile>
				<TimerIcon weight="fill" />
			</IconTile>
			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate font-heading text-body font-medium">
					{t("settings.app.appLock.after.title")}
				</span>
				<span class="text-caption leading-snug text-muted-foreground">
					{t("settings.app.appLock.after.description")}
				</span>
			</div>
		</div>
		<SettingsSegmented
			{options}
			bind:value={
				() => `${after}`,
				(next: string) => {
					const appLockAfter = Number(next || "60") as AppLockAfter;
					pendingAfter = appLockAfter;
					setPreferences({ appLockAfter })
						.catch((error: unknown) => {
							showErrorToast({
								label: t("settings.setting.errors.saveFailed"),
								error,
							});
						})
						.finally(() => {
							pendingAfter = null;
						});
				}
			}
		/>
	</div>
{/if}
