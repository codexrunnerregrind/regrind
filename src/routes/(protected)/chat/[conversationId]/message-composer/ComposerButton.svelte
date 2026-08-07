<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let {
		icon,
		class: className,
		...props
	}: {
		icon: import("svelte").Snippet<
			[import("phosphor-svelte").IconComponentProps]
		>;
		class?: import("svelte/elements").ClassValue;
	} & import("svelte").ComponentProps<typeof Button> = $props();
</script>

<Button
	type="button"
	variant="secondary"
	size="icon"
	class={["size-10 shrink-0 cursor-pointer rounded-md p-0", className]}
	{...props}
>
	{@render icon({ class: "size-4.5" })}
</Button>
