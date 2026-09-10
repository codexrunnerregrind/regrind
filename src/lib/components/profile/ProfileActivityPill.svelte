<script lang="ts">
	import { formatDistanceStrict } from "date-fns";
	import ChatIcon from "phosphor-svelte/lib/ChatIcon";

	import { profileActivity } from "$lib/interest/profile-activity.svelte";
	import { getNow } from "$lib/util/now";
	import TapIcon from "./TapIcon.svelte";

	let {
		profileId,
		tappedAt,
		chattedAt,
	}: {
		profileId: number;
		/** `lastReceivedTapTimestamp`: when they last tapped us. */
		tappedAt: number | null;
		/** `lastChatTimestamp`: the last message either of us sent. */
		chattedAt: number | null;
	} = $props();

	const activity = $derived(
		profileActivity({ profileId, tappedAt, chattedAt }, getNow()),
	);

	function when(at: number): string {
		return formatDistanceStrict(at, getNow(), { addSuffix: true });
	}
</script>

{#if activity.length > 0}
	<!-- Rides the photo's bottom edge opposite the actions overlaid on it, and
	     puts its *contents* on the `px-5` line everything below is written on, so
	     it reads as the profile's first line rather than as something stuck to
	     the picture. Hence `start-3`: the plate is pulled left by its own `px-2`
	     so the flame, not the plate's edge, lands on 20px.

	     The foot is pinned half a row below that edge — `py-1.5` twice plus a
	     16px line, so 14px — which puts a single line centred on exactly the line
	     those buttons sit on. Further lines then stack upwards off a fixed foot,
	     rather than growing down into the name below.

	     Capped short of the two buttons — 2×`size-12` plus their gap, their inset
	     and this one — since they hang into the photo far enough to meet a long
	     "Tapped you 8 days ago", which trims instead.

	     The radius is fixed at half a single line's height (6px padding twice
	     plus a 16px line), so one line rounds to a pill and further lines keep
	     exactly those corners instead of bowing out into a lozenge. -->
	<div
		class="pointer-events-none absolute start-3 -bottom-3.5 flex max-w-[calc(100%-8.5rem)] flex-col gap-1.5 rounded-[14px] bg-plate scrim px-2 py-1.5 backdrop-filter-(--bd-veil)"
	>
		{#each activity as entry (entry.kind)}
			<div class="flex items-center gap-1.5">
				{#if entry.kind === "tap"}
					<TapIcon tapType={entry.tapType} sent class="size-3.5" />
				{:else}
					<ChatIcon
						weight="fill"
						aria-hidden="true"
						class="size-3.5 shrink-0 text-plate-accent"
					/>
				{/if}
				<span
					class={[
						"truncate text-xs font-semibold",
						{
							"text-plate-tap": entry.kind === "tap",
							"text-plate-accent": entry.kind === "chat",
						},
					]}
				>
					{entry.kind === "tap" ? "Tapped you" : "Chatted"}
					{when(entry.at)}
				</span>
			</div>
		{/each}
	</div>
{/if}
