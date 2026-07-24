<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	import PillTabs from "$lib/components/shared/PillTabs.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { hapticSelection } from "$lib/platform/haptics";
	import { swipeTabs } from "$lib/util/swipe-tabs";

	let { children }: { children?: import("svelte").Snippet } = $props();

	const tabs = [
		{ value: "/interest/views", label: "Views", href: "/interest/views" },
		{ value: "/interest/taps", label: "Taps", href: "/interest/taps" },
	];

	const activeIndex = $derived(
		Math.max(
			0,
			tabs.findIndex((tab) => tab.value === page.url.pathname),
		),
	);

	function select(value: string) {
		if (value === page.url.pathname) return;
		hapticSelection();
		void goto(value);
	}

	function selectIndex(index: number) {
		const tab = tabs[index];
		if (tab) select(tab.value);
	}
</script>

<ProgressiveBlur
	direction="topToBottom"
	tag="nav"
	data-fixed-header
	class="fixed top-0 left-0 z-10 w-full px-4 pt-fixed-header pb-2"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="w-full"
>
	<PillTabs {tabs} value={tabs[activeIndex].value} onSelect={select} />
</ProgressiveBlur>
<div
	class="contents"
	use:swipeTabs={{
		onNext: () => selectIndex(activeIndex + 1),
		onPrev: () => selectIndex(activeIndex - 1),
	}}
>
	{@render children?.()}
</div>
