<script lang="ts">
	import { tabShellShowing } from "#lib/components/tab-shell/tab-shell-state.svelte.ts";
	import BrowseScreen from "./BrowseScreen.svelte";
</script>

<!-- On a phone the tab shell shows this screen as one of its panes. -->
{#if !tabShellShowing()}
	<BrowseScreen active />
{/if}
