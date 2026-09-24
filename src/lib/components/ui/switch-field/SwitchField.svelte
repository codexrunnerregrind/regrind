<script lang="ts">
	import { Label } from "$lib/components/ui/label";
	import { Spinner } from "$lib/components/ui/spinner";
	import { Switch } from "$lib/components/ui/switch";
	import { cn } from "$lib/util/utils";

	let {
		title,
		description,
		icon,
		checked = $bindable(),
		disabled = false,
		busy = false,
		class: className,
	}: {
		title: string;
		description?: string;
		/** Drawn in a tile at the start of the row, ahead of the title. */
		icon?: import("svelte").Snippet;
		checked: boolean;
		disabled?: boolean;
		busy?: boolean;
		class?: string;
	} = $props();
</script>

<Label
	class={cn(
		"flex items-center gap-3 rounded-xl border p-4 transition-all hover:bg-muted aria-disabled:opacity-60",
		className,
	)}
	aria-disabled={disabled || busy}
>
	{#if icon}
		<!-- A tile rather than a bare glyph: it holds the icon at one size
		     whichever row it is on, and reads as part of the field instead of as
		     punctuation in front of the title. -->
		<span
			class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background"
		>
			{@render icon()}
		</span>
	{/if}
	<div class="grid min-w-0 grow gap-1.5 font-normal">
		<p class="text-sm leading-none font-medium">{title}</p>
		{#if description !== undefined}
			<p class="text-sm text-muted-foreground">
				{description}
			</p>
		{/if}
	</div>
	{#if busy}
		<Spinner class="text-muted-foreground" />
	{/if}
	<Switch bind:checked disabled={disabled || busy} />
</Label>
