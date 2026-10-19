<script lang="ts">
	import ArrowSquareOutIcon from "phosphor-svelte/lib/ArrowSquareOutIcon";
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";

	import IconTile from "./IconTile.svelte";

	let {
		title,
		description,
		icon,
		href,
		external = false,
		onclick,
		value,
		trailing,
		chevron,
		destructive = false,
		disabled = false,
		as,
	}: {
		title: string;
		description?: string;
		icon?: import("svelte").Snippet;
		href?: string;
		/** Renders an outward-link glyph and opens in the system browser. */
		external?: boolean;
		onclick?: (event: MouseEvent) => void;
		/** Trailing detail text, e.g. the current value of the setting. */
		value?: string;
		/** Trailing control (a switch, a badge). Suppresses the chevron. */
		trailing?: import("svelte").Snippet;
		chevron?: boolean;
		destructive?: boolean;
		disabled?: boolean;
		/** Force the element type. `label` makes the whole row drive a control. */
		as?: "label" | "div";
	} = $props();

	const tag = $derived(
		as ?? (href ? "a" : onclick ? "button" : ("div" as const)),
	);
	const interactive = $derived(
		tag === "a" || tag === "button" || tag === "label",
	);
	// A chevron is implied by navigation, but never competes with a trailing
	// control, and callers can force it either way.
	const showChevron = $derived(
		chevron ?? (!trailing && Boolean(href ?? onclick)),
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- `tag` resolves to a button whenever onclick is passed without an href, so
     the click target is always a natively interactive element. -->
<svelte:element
	this={tag}
	href={tag === "a" ? href : undefined}
	target={tag === "a" && external ? "_blank" : undefined}
	rel={tag === "a" && external ? "nofollow noreferrer noopener" : undefined}
	type={tag === "button" ? "button" : undefined}
	disabled={tag === "button" && disabled ? true : undefined}
	aria-disabled={disabled ? "true" : undefined}
	{onclick}
	class={[
		"flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-start transition-colors",
		{
			"cursor-pointer active:bg-muted": interactive && !disabled,
			"can-hover:hover:bg-muted": interactive && !disabled,
			"opacity-55": disabled,
		},
		"outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
	]}
>
	{#if icon}
		<span class={{ "text-destructive": destructive }}>
			<IconTile>
				{@render icon()}
			</IconTile>
		</span>
	{/if}
	<span class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span
			class={[
				"truncate font-heading text-row leading-snug font-medium",
				{ "text-destructive": destructive },
			]}
		>
			{title}
		</span>
		{#if description}
			<span class="text-caption leading-snug text-muted-foreground">
				{description}
			</span>
		{/if}
	</span>
	{#if value}
		<span class="max-w-[45%] truncate text-sm text-muted-foreground">
			{value}
		</span>
	{/if}
	{@render trailing?.()}
	{#if showChevron}
		{#if external}
			<ArrowSquareOutIcon
				class="size-4 shrink-0 text-muted-foreground/70"
			/>
		{:else}
			<CaretRightIcon
				weight="bold"
				class="size-4 shrink-0 text-muted-foreground/60"
			/>
		{/if}
	{/if}
</svelte:element>
