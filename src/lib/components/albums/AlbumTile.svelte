<script lang="ts">
	import ImageBrokenIcon from "phosphor-svelte/lib/ImageBrokenIcon";
	import LockSimpleIcon from "phosphor-svelte/lib/LockSimpleIcon";

	import { hapticImpact } from "$lib/platform/haptics";
	import { longPressHandlers } from "$lib/util/long-press";
	import AlbumContextMenu from "./AlbumContextMenu.svelte";

	let {
		coverUrl,
		title,
		subtitle,
		badge,
		unseen = false,
		locked = false,
		loading = false,
		disabled = false,
		onclick,
		onRemove,
		removeLabel = "Remove Album",
	}: {
		coverUrl: string | null | undefined;
		title: string;
		subtitle?: string;
		badge?: string;
		unseen?: boolean;
		locked?: boolean;
		loading?: boolean;
		disabled?: boolean;
		onclick: () => void;
		// When provided, holding the tile lifts it over a blurred backdrop and
		// offers this one action, the way the official app's albums screen does.
		onRemove?: () => void;
		removeLabel?: string;
	} = $props();

	let tileElement: HTMLElement | null = $state(null);
	let contextMenuOpen:
		| false
		| { x: number; y: number; width: number; height: number } = $state(false);

	function openContextMenu() {
		if (!tileElement || !onRemove) return;
		const rect = tileElement.getBoundingClientRect();
		hapticImpact("medium");
		contextMenuOpen = {
			x: rect.x,
			y: rect.y,
			width: rect.width,
			height: rect.height,
		};
	}

	const longPress = $derived(
		onRemove ? longPressHandlers(openContextMenu) : {},
	);
</script>

{#snippet tileContent()}
	{#if coverUrl}
		<img
			src={coverUrl}
			alt=""
			class="size-full rounded-[inherit] bg-card-foreground/10 object-cover"
			draggable="false"
		/>
	{:else}
		<div
			class="flex size-full items-center justify-center rounded-[inherit] bg-card-foreground/20"
		>
			<ImageBrokenIcon
				weight="fill"
				class="size-8"
				color="var(--media-placeholder-foreground)"
			/>
		</div>
	{/if}
	<!-- One label band per tile rather than scattered overlays — the same tile
	     grammar as the profile grids (ProfileMiniCard.svelte), on the lighter ramp
	     since an album's label is one short line. -->
	<div class="tile-scrim-soft flex flex-col items-start text-start">
		<span class="line-clamp-2 text-meta/[1.1] font-semibold">
			{title}
		</span>
		{#if subtitle}
			<span class="mt-0.5 line-clamp-1 text-3xs/[1.1] text-plate-muted">
				{subtitle}
			</span>
		{/if}
	</div>
	{#if badge}
		<span
			class="pointer-events-none absolute top-1.5 left-1.5 rounded-plate bg-primary px-1.5 py-0.5 text-3xs font-semibold text-primary-foreground"
		>
			{badge}
		</span>
	{/if}
	{#if locked}
		<!-- The one plate on the tile: a glyph alone would read as part of the cover
		     rather than as the album's state. Fill only, no backdrop blur: this
		     rides in a scrolling grid, and a blur per tile costs a snapshot of
		     everything behind it every frame. -->
		<span
			class="pointer-events-none absolute top-2 right-2 flex size-6.5 items-center justify-center rounded-full bg-plate-strong text-plate-foreground"
			aria-label="Locked"
		>
			<LockSimpleIcon weight="fill" class="size-3.5" />
		</span>
	{/if}
	{#if unseen}
		<!-- Drawn *inside* the tile: `.photo-grid` clips to its own rounded box, so
		     an outward ring loses the side that sits on the grid's edge, and what
		     survives bleeds across the 2px gap into the neighbouring tile. -->
		<span
			class="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-accent"
		></span>
	{/if}
{/snippet}

<button
	type="button"
	bind:this={tileElement}
	class={[
		"relative aspect-album cursor-pointer rounded-lg [-webkit-touch-callout:none] **:[-webkit-touch-callout:none]",
		{ "opacity-50": loading },
	]}
	aria-label={unseen ? `Open ${title}, new content` : `Open ${title}`}
	{disabled}
	{onclick}
	{...longPress}
	style:visibility={contextMenuOpen ? "hidden" : undefined}
>
	{@render tileContent()}
</button>

{#if contextMenuOpen && onRemove}
	<AlbumContextMenu
		{contextMenuOpen}
		{removeLabel}
		{onRemove}
		style=""
		onClose={() => (contextMenuOpen = false)}
	>
		{#snippet content()}
			<div class="relative size-full rounded-lg">
				{@render tileContent()}
			</div>
		{/snippet}
	</AlbumContextMenu>
{/if}
