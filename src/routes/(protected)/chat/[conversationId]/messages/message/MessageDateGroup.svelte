<script lang="ts">
	import { format, isToday, startOfToday } from "date-fns";

	let { dayStart }: { dayStart: number } = $props();
</script>

<!-- A lettered rule rather than a pill: it separates days without competing with
     the bubbles either side of it. -->
<span
	class="mb-4 text-center text-3xs leading-none font-medium tracking-[0.14em] text-ink3 uppercase"
>
	{#if isToday(dayStart)}
		Today
	{:else if startOfToday().getTime() - dayStart < 7 * 24 * 60 * 60 * 1000}
		{format(dayStart, "EEEE")}
	{:else}
		{format(dayStart, "E, LLL d")}
	{/if}
</span>
