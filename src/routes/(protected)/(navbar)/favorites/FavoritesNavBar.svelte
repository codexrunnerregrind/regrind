<script lang="ts">
	import { ArrowLeftIcon } from "phosphor-svelte";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="w-full shrink-0 z-20 fixed top-0 left-0 h-[calc(4.75rem+var(--safe-area-top))]"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex items-center h-full pe-5.5 pt-(--safe-area-top)"
	tag="nav"
>
	<a href="/" class="flex items-center justify-center w-19 h-full shrink-0">
		<ArrowLeftIcon size={32} />
	</a>
	<span class="truncate min-w-0 text-lg font-semibold">Favorites</span>
</ProgressiveBlur>
