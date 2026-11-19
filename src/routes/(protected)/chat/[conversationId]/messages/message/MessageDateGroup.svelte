<script lang="ts">
	import { isToday, startOfToday } from "date-fns";

	import { formatDate } from "#lib/i18n/format.ts";
	import { t } from "#lib/i18n/index.ts";

	let { dayStart }: { dayStart: number } = $props();
</script>

<!-- A lettered rule rather than a pill: it separates days without competing with
     the bubbles either side of it. -->
<!-- eslint-disable better-tailwindcss/no-restricted-classes -->
<span
	class="mb-4 text-center text-3xs leading-none font-medium tracking-[0.14em] text-ink3 uppercase"
>
	<!-- eslint-enable better-tailwindcss/no-restricted-classes -->
	{#if isToday(dayStart)}
		{t("common.time.today")}
	{:else if startOfToday().getTime() - dayStart < 7 * 24 * 60 * 60 * 1000}
		{formatDate({ date: dayStart, preset: "weekday" })}
	{:else}
		{formatDate({ date: dayStart, preset: "weekdayMonthDay" })}
	{/if}
</span>
