<script lang="ts">
	import { Skeleton } from "$lib/components/ui/skeleton";
</script>

<!-- The loading shape of ProfileActionRow: same padding, gap, avatar size and
     inter-row separator, so rows don't shift when the real ones arrive. Only
     the avatar, the name and the chip are tinted — the row stays transparent
     rather than reading as one grey block. -->
<div
	class="flex items-center gap-3.5 py-3.5 not-last:border-b not-last:border-border first:pt-0"
	aria-hidden="true"
>
	<Skeleton class="size-15 shrink-0 rounded-full" />
	<div class="flex min-w-0 flex-1 flex-col gap-1.5">
		<Skeleton class="h-4 w-32 rounded-md" />
		<Skeleton class="h-3 w-20 rounded-md" />
	</div>
	<Skeleton class="h-9 w-20 shrink-0 rounded-lg" />
</div>
