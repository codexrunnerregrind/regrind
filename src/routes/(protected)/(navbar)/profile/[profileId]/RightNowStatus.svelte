<script lang="ts">
	import ProfileRightNowIndicator from "$lib/components/profile/ProfileRightNowIndicator.svelte";
	import type { RightNowStatus } from "$lib/model/right-now";

	let { rightNow }: { rightNow: RightNowStatus | null | undefined } =
		$props();

	const active = $derived(
		rightNow === "HOSTING" || rightNow === "NOT_HOSTING",
	);
</script>

<!-- Sits with the online status and the distance, which is where the rest of
     "what is true about this person now" already lives. The glyph is the grid
     tiles' own indicator, at the size it draws itself, so the two read as one
     thing.

     Deliberately no "posted 34 mins ago": the row is narrow, and a post that is
     up is up — when it started is not what you are reading this row for. -->
{#if active}
	<span
		class="flex shrink-0 items-center gap-1 font-semibold text-fuchsia-600"
	>
		<ProfileRightNowIndicator {rightNow} />
		{rightNow === "HOSTING" ? "Hosting" : "Right Now"}
	</span>
{/if}
