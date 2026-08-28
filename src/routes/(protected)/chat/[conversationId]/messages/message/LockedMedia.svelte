<script lang="ts">
	import { LockIcon } from "phosphor-svelte";

	let {
		class: className,
		size = "md",
		children,
	}: {
		class: import("svelte/elements").ClassValue;
		size?: "sm" | "md";
		children?: import("svelte").Snippet;
	} = $props();
</script>

<div
	class={[
		"chat-media-tint flex size-full items-center justify-center rounded-xl",
		className,
	]}
>
	<LockIcon
		weight="fill"
		class={[
			"aspect-square h-auto",
			{ "w-1/8": size === "sm", "w-1/6": size === "md" },
		]}
		color="var(--media-placeholder-foreground)"
	/>
	{@render children?.()}
</div>
