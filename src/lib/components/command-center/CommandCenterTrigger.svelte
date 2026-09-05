<script>
	import { UserIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import * as Kbd from "$lib/components/ui/kbd";
	import { modifierKeyLabel } from "$lib/platform/keybindings";
	import { isMobilePlatform } from "$lib/platform/os";
	import { commandCenterState } from "./command-center-state.svelte";

	const isMobile = isMobilePlatform();
	const modifierKey = modifierKeyLabel();
</script>

<Button
	variant="secondary"
	aria-label="Open profile by ID"
	onclick={() => (commandCenterState.open = true)}
	class={{ "pe-1.5": !isMobile }}
>
	<UserIcon />
	{#if !isMobile}
		<Kbd.Root>{modifierKey} + K</Kbd.Root>
	{/if}
</Button>
