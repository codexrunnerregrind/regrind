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
	data-slot="sheet-footer"
	class={cn(
		// Buttons shaped like the dialog footer's — see dialog-footer.svelte.
		"mt-auto flex flex-col gap-2.5 p-5 [&_.cn-button]:h-10! [&_.cn-button]:rounded-lg!",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
