<script lang="ts">
	import { CaretRightIcon, XIcon } from "phosphor-svelte";
	import { expoOut } from "svelte/easing";
	import type { TransitionConfig } from "svelte/transition";

	import { instantWhenReducedMotion } from "$lib/util/reduced-motion";
	import { cn } from "$lib/util/utils";

	let {
		checked = $bindable(),
		id,
		label,
		endLabel,
		children,
		contentClass,
		class: className,
	}: {
		checked: boolean;
		id: string;
		label: string;
		/** What the filter is set to, shown in place of "Any" once it is on. */
		endLabel?: string;
		children?: import("svelte").Snippet;
		contentClass?: import("svelte/elements").ClassValue;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	// Every row starts closed, set or not: the summary says what it holds, so
	// the sheet opens as a list you can scan rather than a wall of chips.
	let expanded = $state(false);

	const summary = $derived(checked && endLabel ? endLabel : "Any");

	const uid = $props.id();

	const hide = instantWhenReducedMotion(
		(node: HTMLDivElement): TransitionConfig => {
			const height = node.scrollHeight;
			return {
				duration: 400,
				css: (t: number, u: number) =>
					`height: calc(${t} * ${height}px); opacity: ${t}; margin-top: calc(${u} * -8px)`,
				easing: expoOut,
			};
		},
	);
</script>

<!-- A list row rather than a checkbox: the value itself says whether the filter
     is on, so the row only has to show what it is set to and open on tap. -->
<div class={["flex min-w-0 shrink-0 flex-col", className]}>
	<div class="flex w-full items-center">
		<button
			type="button"
			id="filters-{id}-{uid}"
			aria-expanded={expanded}
			class="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-start"
			onclick={() => (expanded = !expanded)}
		>
			<span class="shrink-0">{label}</span>
			<span
				class={[
					"ml-auto min-w-0 truncate",
					{
						"text-primary": checked,
						"text-muted-foreground": !checked,
					},
				]}
			>
				{summary}
			</span>
			<CaretRightIcon
				class={[
					"shrink-0 text-muted-foreground transition-transform",
					{ "rotate-90": expanded },
				]}
			/>
		</button>
		{#if checked}
			<button
				type="button"
				aria-label="Clear {label}"
				class="me-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				onclick={() => (checked = false)}
			>
				<XIcon />
			</button>
		{/if}
	</div>
	{#if expanded}
		<div
			class={cn("shrink-0 overflow-clip px-3 pb-3", contentClass)}
			transition:hide
		>
			{@render children?.()}
		</div>
	{/if}
</div>
