<script lang="ts">
	import UserIcon from "phosphor-svelte/lib/UserIcon";

	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Kbd from "#lib/components/ui/kbd/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import {
		commandCenterKeybinding,
		parseShortcut,
	} from "#lib/platform/keybindings.ts";
	import { isMobilePlatform } from "#lib/platform/os.ts";
	import { commandCenterState } from "./command-center-state.svelte";

	const isMobile = isMobilePlatform();
	const shortcut = parseShortcut(commandCenterKeybinding);
	const modifierKey = $derived(
		shortcut.modifier === "meta" ? "⌘" : t("commands.trigger.controlKey"),
	);
	const keySuffix = ` + ${shortcut.key}`;
</script>

<Button
	variant="secondary"
	aria-label="Open profile by ID"
	onclick={() => (commandCenterState.open = true)}
	class={{ "pe-1.5": !isMobile }}
>
	<UserIcon />
	{#if !isMobile}
		<Kbd.Root>
			<span>{modifierKey}<span translate="no">{keySuffix}</span></span>
		</Kbd.Root>
	{/if}
</Button>
