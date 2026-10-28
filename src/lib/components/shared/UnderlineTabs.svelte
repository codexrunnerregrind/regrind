<script lang="ts" module>
	export type UnderlineTab = {
		value: string;
		label: string;
		/** Shown after the label, dimmed. Omitted while the list is still loading. */
		count?: number | null;
	};
</script>

<script lang="ts">
	let {
		tabs,
		value,
		onSelect,
		scroller = null,
		following = false,
		class: className,
	}: {
		tabs: UnderlineTab[];
		value: string;
		onSelect?: (value: string) => void;
		/** A pager with one page per tab; the underline tracks its scroll while `following`. */
		scroller?: HTMLElement | null;
		following?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	let list: HTMLElement | null = $state(null);
	let bar: HTMLElement | null = $state(null);
	let width = $state(0);

	const tracking = $derived(
		following && scroller !== null && "ScrollTimeline" in window,
	);

	// The page under the pager's midpoint, so the label turns bold as the
	// underline crosses over rather than once the tab is selected.
	let nearest = $state<number | null>(null);
	$effect(() => {
		const node = scroller;
		if (!following || !node) {
			nearest = null;
			return;
		}
		const update = () => {
			if (node.clientWidth > 0)
				nearest = Math.round(node.scrollLeft / node.clientWidth);
		};
		update();
		node.addEventListener("scroll", update, { passive: true });
		return () => node.removeEventListener("scroll", update);
	});
	const shown = $derived(
		nearest === null ? value : (tabs[nearest]?.value ?? value),
	);

	// Keyframes sit at i/(n-1): that is where page i rests in the scroll range.
	$effect(() => {
		if (!tracking || !list || !bar || !scroller) return;
		void width;
		void tabs.map((tab) => tab.count);
		void shown;
		const buttons = [...list.querySelectorAll<HTMLElement>("[role=tab]")];
		if (buttons.length < 2) return;
		const keyframes = buttons.map((button, index) => ({
			offset: index / (buttons.length - 1),
			translate: `${button.offsetLeft}px 0`,
			scale: `${button.offsetWidth} 1`,
		}));
		const animation = bar.animate(keyframes, {
			fill: "both",
			easing: "linear",
			timeline: new ScrollTimeline({ source: scroller, axis: "x" }),
		});
		return () => animation.cancel();
	});
</script>

<!-- Plain text tabs sitting on a hairline, with the active one marked by a 2pt
     accent underline rather than a pill. Left-aligned: they label the list
     below them, they are not a segmented control. -->
<div
	bind:this={list}
	bind:clientWidth={width}
	role="tablist"
	class={[
		"relative flex items-end gap-5.5 border-b border-border",
		className,
	]}
>
	{#each tabs as tab (tab.value)}
		{@const active = shown === tab.value}
		<button
			type="button"
			role="tab"
			aria-selected={value === tab.value}
			onclick={() => onSelect?.(tab.value)}
			class={[
				"relative pb-2.75 text-caption transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				{
					"font-semibold text-foreground": active,
					"font-medium text-ink3": !active,
				},
			]}
		>
			<!-- Out of the accessible name: the tab is "Taps", and reading it as
			     "Taps 34" would put a number that changes on its own into the
			     handle every test and every screen reader uses to find it. -->
			{tab.label}{#if tab.count !== null && tab.count !== undefined}<span
					aria-hidden="true"
					class="ms-1 font-medium text-ink3 tabular-nums"
					>{tab.count}</span
				>{/if}
			{#if active && !tracking}
				<span
					class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
				></span>
			{/if}
		</button>
	{/each}
	{#if tracking}
		<span
			bind:this={bar}
			aria-hidden="true"
			class="pointer-events-none absolute -bottom-px left-0 h-0.5 w-px origin-left bg-primary"
		></span>
	{/if}
</div>
