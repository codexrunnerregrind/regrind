<script lang="ts">
	import LockKeyIcon from "phosphor-svelte/lib/LockKeyIcon";

	import { Button } from "#lib/components/ui/button/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import {
		appLockAuthenticating,
		appLockCovering,
		appLocked,
		promptWhenLocked,
		unlockApp,
	} from "#lib/platform/app-lock.svelte.ts";
	import icon from "../../../../contrib/logo/regrind.svg";

	// Cold start: ask as soon as the preference says the lock is on.
	$effect(() => {
		if (appLocked()) promptWhenLocked();
	});
</script>

{#if appLockCovering()}
	<div
		data-slot="app-lock"
		class="fixed inset-0 z-app-lock flex flex-col items-center justify-center gap-6 bg-background px-8"
		role="dialog"
		aria-modal="true"
		aria-label={t("settings.app.appLock.locked")}
	>
		<img src={icon} alt="" class="size-24" />
		{#if appLocked()}
			<p class="flex items-center gap-2 text-body text-muted-foreground">
				<LockKeyIcon weight="fill" />
				{t("settings.app.appLock.locked")}
			</p>
			<Button
				disabled={appLockAuthenticating()}
				onclick={() => void unlockApp()}
			>
				{t("settings.app.appLock.unlock")}
			</Button>
		{/if}
	</div>
{/if}
