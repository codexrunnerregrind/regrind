<script lang="ts">
	import { tabShellShowing } from "$lib/components/tab-shell/tab-shell-state.svelte";
	import InterestScreen from "./InterestScreen.svelte";

	let { data }: import("./$types").LayoutProps = $props();
</script>

<!-- The sub-tabs' pages are empty: the screen pages between them itself. On a
     phone the tab shell shows it as one of its panes. -->
{#if !tabShellShowing()}
	<InterestScreen ourProfileId={data.ourProfileId} active />
{/if}
