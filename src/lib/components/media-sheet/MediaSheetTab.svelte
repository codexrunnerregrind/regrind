<script lang="ts">
	import type { Tabs as TabsPrimitive } from "bits-ui";

	import * as Tabs from "$lib/components/ui/tabs";
	import { cn } from "$lib/util/utils";

	let { class: className, ...restProps }: TabsPrimitive.TriggerProps =
		$props();
</script>

<Tabs.Trigger
	class={cn(
		"h-auto w-24 flex-none flex-col gap-0.5 py-1.5 text-ink3 hover:bg-transparent dark:hover:bg-transparent data-active:text-primary! dark:data-active:text-primary!",
		className,
	)}
	{...restProps}
/>
