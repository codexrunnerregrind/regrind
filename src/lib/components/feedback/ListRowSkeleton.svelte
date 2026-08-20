<script lang="ts">
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
</script>

<!-- Padding, gap and the inset divider mirror ProfileItem/RightNowPost so loading
     rows occupy the same frame as real rows: the row itself stays transparent and
     only the avatar/text placeholders are tinted. -->
<div
	data-slot="list-row-skeleton"
	class="relative flex h-22 w-full shrink-0 gap-3 py-3 ps-4 pe-4 after:pointer-events-none after:absolute after:right-4 after:bottom-0 after:left-list-inset after:border-b after:border-border/60"
	aria-hidden="true"
>
	<Skeleton class="size-16 shrink-0 rounded-full" />
	<div class="flex min-w-0 flex-1 flex-col justify-center gap-2">
		<Skeleton class="h-4 w-32 rounded-md" />
		<Skeleton class="h-3 w-20 rounded-md" />
	</div>
</div>
