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
		position = null,
		gliding = false,
		class: className,
	}: {
		tabs: UnderlineTab[];
		value: string;
		onSelect?: (value: string) => void;
		/**
		 * Where a pager with one page per tab is, in tabs (1.5: halfway from the
		 * second to the third). The underline and the bold label follow it.
		 */
		position?: number | null;
		/** The pager is easing to rest; the underline eases with it. */
		gliding?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	// Matches the pager's own settle, so the two land together.
	const GLIDE = "320ms cubic-bezier(0.22, 1, 0.36, 1)";

	let list: HTMLElement | null = $state(null);
	let width = $state(0);
	let spans = $state<{ left: number; width: number }[]>([]);

	// The label turns bold as the underline crosses over, not once the tab is
	// selected.
	const shown = $derived(
		position === null
			? value
			: (tabs[Math.round(position)]?.value ?? value),
	);

	$effect(() => {
		if (position === null || !list) return;
		void width;
		void tabs.map((tab) => tab.count);
		void shown;
		spans = [...list.querySelectorAll<HTMLElement>("[role=tab]")].map(
			(button) => ({
				left: button.offsetLeft,
				width: button.offsetWidth,
			}),
		);
	});

	const bar = $derived.by(() => {
		if (position === null || spans.length === 0) return null;
		const clamped = Math.max(0, Math.min(position, spans.length - 1));
		const from = spans[Math.floor(clamped)]!;
		const to = spans[Math.ceil(clamped)]!;
		const t = clamped - Math.floor(clamped);
		return {
			left: from.left + (to.left - from.left) * t,
			width: from.width + (to.width - from.width) * t,
		};
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
			{#if active && !bar}
				<span
					class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
				></span>
			{/if}
		</button>
	{/each}
	{#if bar}
		<span
			aria-hidden="true"
			class="pointer-events-none absolute -bottom-px left-0 h-0.5 w-px origin-left bg-primary"
			style:translate="{bar.left}px 0"
			style:scale="{bar.width} 1"
			style:transition={gliding
				? `translate ${GLIDE}, scale ${GLIDE}`
				: "none"}
		></span>
	{/if}
</div>
