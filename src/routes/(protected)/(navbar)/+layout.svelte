<script lang="ts">
	import { page } from "$app/state";

	import { swipeToNavTab } from "$lib/components/shared/nav-tabs";
	import NavBar from "$lib/components/shared/NavBar.svelte";
	import { tabShellShowing } from "$lib/components/tab-shell/tab-shell-state.svelte";
	import { swipeTabs } from "$lib/util/swipe-tabs";

	let { data, children }: import("./$types").LayoutProps = $props();
</script>

<!-- The tab swipe lives here rather than on each page, so every screen the
     bottom bar owns gets it once. On a phone the tab shell shows the tabs' own
     screens instead, their pages render nothing, and it brings its own swipe
     and nav bar; the wrapper stays either way so the layouts below it (the
     settings stack) are not remounted as the shell comes and goes. -->
<div
	class="flex min-h-dvh flex-col pt-(--safe-area-top) pb-(--content-pb)"
	use:swipeTabs={{
		enabled: !tabShellShowing(),
		onNext: () => swipeToNavTab(page.route.id, 1),
		onPrev: () => swipeToNavTab(page.route.id, -1),
	}}
>
	{@render children?.()}
</div>
{#if !tabShellShowing()}
	<!-- An account switch stays in this layout, and NavBar reads its account once. -->
	{#key data.ourProfileId}
		<NavBar ourProfileId={data.ourProfileId} />
	{/key}
{/if}
