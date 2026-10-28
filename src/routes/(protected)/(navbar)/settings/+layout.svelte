<script lang="ts">
	import { tabShellShowing } from "$lib/components/tab-shell/tab-shell-state.svelte";
	import PageStack from "./page-stack/PageStack.svelte";

	let { children }: import("./$types").LayoutProps = $props();

	// On a phone the tab shell shows the You screen itself.
	function shellYouPane(): HTMLElement | null {
		if (!tabShellShowing()) return null;
		return document.querySelector<HTMLElement>('[data-tab-pane="You"]');
	}
</script>

<PageStack
	scope="/settings"
	rootPane={shellYouPane}
	rootElsewhere={tabShellShowing()}
>
	{@render children?.()}
</PageStack>
