<script lang="ts">
	import { tabShellShowing } from "$lib/components/tab-shell/tab-shell-state.svelte";
	import RightNowScreen from "./RightNowScreen.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<!-- On a phone the tab shell shows this screen as one of its panes. -->
{#if !tabShellShowing()}
	<RightNowScreen ourProfileId={data.ourProfileId} />
{/if}
