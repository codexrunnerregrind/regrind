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
	<div
		class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-start gap-0.5 rounded-b-[inherit] bg-linear-to-t from-black/75 to-transparent p-2 pt-6 text-start"
	>
		<span class="line-clamp-2 text-xs font-medium text-white">
			{title}
		</span>
		{#if subtitle}
			<span class="line-clamp-1 text-[0.7rem] text-white/70">
				{subtitle}
			</span>
		{/if}
	</div>
	{#if badge}
		<span
			class="pointer-events-none absolute top-1.5 left-1.5 rounded-full bg-primary/90 px-2 py-0.5 text-xs font-medium text-primary-foreground"
		>
			{badge}
		</span>
	{/if}
	{#if locked}
		<span
			class="pointer-events-none absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white"
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
		"relative aspect-3/4 cursor-pointer rounded-lg [-webkit-touch-callout:none] **:[-webkit-touch-callout:none]",
		loading && "opacity-50",
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
