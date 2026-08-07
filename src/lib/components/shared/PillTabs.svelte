<script lang="ts" module>
	export type PillTab = {
		value: string;
		label: string;
		/** When set the tab renders as a navigation link. */
		href?: string;
	};
</script>

<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { toggleVariants } from "$lib/components/ui/toggle";

	let {
		tabs,
		value,
		onSelect,
		class: className,
	}: {
		tabs: PillTab[];
		value: string;
		onSelect?: (value: string) => void;
		class?: import("svelte/elements").ClassValue;
	} = $props();
</script>

<div class={["mx-auto flex w-full max-w-120 items-center *:flex-1", className]}>
	{#each tabs as tab (tab.value)}
		{@const active = value === tab.value}
		<Button
			href={tab.href}
			onclick={() => onSelect?.(tab.value)}
			class={[
				toggleVariants({ variant: "default" }),
				"text-muted-foreground",
				{
					"hover:bg-muted-foreground/10": !active,
					"bg-muted-foreground/15 hover:bg-muted-foreground/20":
						active,
				},
			]}
		>
			{tab.label}
		</Button>
	{/each}
</div>
