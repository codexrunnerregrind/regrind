<script lang="ts">
	import { ArrowLeftIcon } from "phosphor-svelte";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="fixed top-0 left-0 z-20 h-[calc(4.75rem+var(--safe-area-top))] w-full shrink-0"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex items-center h-full pe-5.5 pt-(--safe-area-top)"
	tag="nav"
>
	<a href="/" class="flex h-full w-19 shrink-0 items-center justify-center">
		<ArrowLeftIcon size={32} />
	</a>
	<span class="min-w-0 truncate text-lg font-semibold">Favorites</span>
</ProgressiveBlur>
