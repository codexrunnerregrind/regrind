<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import type { HTMLAttributes } from "svelte/elements";

	import { Button } from "$lib/components/ui/button/index.js";
	import { cn, type WithElementRef } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		showCloseButton,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		showCloseButton?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-footer"
	class={cn(
		// A row, not a stack: two buttons in a phone-width dialog fit side by side,
		// and stacking them read as two separate full-width actions. `flex-1` splits
		// the row evenly, `flex-wrap` with a floor on each button drops the extras
		// onto a second line rather than squeezing their labels.
		"flex flex-wrap justify-end gap-2 *:min-w-28 *:flex-1 sm:*:flex-none",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
	{#if showCloseButton}
		<DialogPrimitive.Close>
			{#snippet child({ props })}
				<Button variant="outline" {...props}>Close</Button>
			{/snippet}
		</DialogPrimitive.Close>
	{/if}
</div>
