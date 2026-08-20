<script lang="ts">
	import { page } from "$app/state";

	import { swipeToNavTab } from "$lib/components/shared/nav-tabs";
	import NavBar from "$lib/components/shared/NavBar.svelte";
	import { swipeTabs } from "$lib/util/swipe-tabs";

	let { data, children }: import("./$types").LayoutProps = $props();
</script>

<!-- The tab swipe lives on the layout, not on each page, so every screen the
     bottom bar owns gets it once. Screens with their own sub-tabs (Interest)
     nest inside and are offered the swipe first; this only sees the ones they
     turn down. Inbox is not under this layout — it attaches its own. -->
<div
	class="flex min-h-dvh flex-col pt-(--safe-area-top) pb-(--content-pb)"
	use:swipeTabs={{
		onNext: () => swipeToNavTab(page.route.id, 1),
		onPrev: () => swipeToNavTab(page.route.id, -1),
	}}
>
	{@render children?.()}
</div>
<NavBar ourProfileId={data.ourProfileId} />
