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
		// the row evenly at every width, `flex-wrap` with a floor on each button
		// drops the extras onto a second line rather than squeezing their labels.
		// The buttons are squarer and taller than the app's default pill: they are
		// the dialog's own footer, matched to the field above them.
		"flex flex-wrap justify-end gap-2.5 *:min-w-28 *:flex-1 [&_.cn-button]:h-10! [&_.cn-button]:rounded-lg!",
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
