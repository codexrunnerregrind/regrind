<script lang="ts" module>
	export type UnderlineTab = { value: string; label: string };
</script>

<script lang="ts">
	let {
		tabs,
		value,
		onSelect,
		class: className,
	}: {
		tabs: UnderlineTab[];
		value: string;
		onSelect?: (value: string) => void;
		class?: import("svelte/elements").ClassValue;
	} = $props();
</script>

<!-- Plain text tabs sitting on a hairline, with the active one marked by a 2pt
     accent underline rather than a pill. Left-aligned: they label the list
     below them, they are not a segmented control. -->
<div
	role="tablist"
	class={["flex items-end gap-5.5 border-b border-border", className]}
>
	{#each tabs as tab (tab.value)}
		{@const active = value === tab.value}
		<button
			type="button"
			role="tab"
			aria-selected={active}
			onclick={() => onSelect?.(tab.value)}
			class={[
				"relative pb-2.75 text-caption transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				{
					"font-semibold text-foreground": active,
					"font-medium text-ink3": !active,
				},
			]}
		>
			{tab.label}
			{#if active}
				<span
					class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
				></span>
			{/if}
		</button>
	{/each}
</div>
