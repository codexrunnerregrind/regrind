<script lang="ts">
	import { Switch } from "$lib/components/ui/switch";
	import SettingsRow from "./SettingsRow.svelte";
	import type { Tint } from "./tints";

	let {
		title,
		description,
		icon,
		tint,
		checked = $bindable(),
		disabled = false,
	}: {
		title: string;
		description?: string;
		icon?: import("svelte").Snippet;
		tint?: Tint;
		checked: boolean;
		disabled?: boolean;
	} = $props();
</script>

<!-- The row is a <label>, so the whole width toggles the switch rather than
     just the 44px control itself. -->
<SettingsRow as="label" {title} {description} {icon} {tint} {disabled}>
	{#snippet trailing()}
		<Switch bind:checked {disabled} class="shrink-0" />
	{/snippet}
</SettingsRow>
