<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { cn, type WithElementRef } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert-dialog-footer"
	class={cn(
		// Laid out like the dialog footer — see dialog-footer.svelte.
		"cn-alert-dialog-footer flex flex-wrap justify-end gap-2 *:min-w-28 *:flex-1 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:*:flex-none",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
