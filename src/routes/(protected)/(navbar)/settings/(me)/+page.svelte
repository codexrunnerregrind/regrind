<script lang="ts">
	import { tabShellShowing } from "$lib/components/tab-shell/tab-shell-state.svelte";
	import YouScreen from "./YouScreen.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<!-- On a phone the tab shell shows this screen as one of its panes. -->
{#if !tabShellShowing()}
	<YouScreen ourProfileId={data.ourProfileId} />
{/if}
