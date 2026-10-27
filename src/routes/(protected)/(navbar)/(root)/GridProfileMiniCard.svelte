<script lang="ts">
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import { formatTimeAgoShort } from "$lib/util/format-time";
	import { getNow } from "$lib/util/now";
	import type { RightNowStatus } from "$lib/model/right-now";

	let {
		id,
		displayName = null,
		age = null,
		distance = null,
		medias = null,
		unread = null,
		onlineUntil = null,
		seen = null,
		isFavorite = false,
		isVisiting = false,
		hadRecentChat = false,
		rightNow = null,
		note = null,
		onclick = undefined,
	}: {
		id: number;
		displayName?: string | null;
		age?: number | null;
		distance?: number | null;
		medias?: { mediaHash: string }[] | null;
		unread?: number | null;
		onlineUntil?: number | null;
		seen?: number | null;
		isFavorite?: boolean;
		isVisiting?: boolean;
		hadRecentChat?: boolean;
		rightNow?: RightNowStatus | null;
		note?: string | null;
		onclick?: import("svelte/elements").MouseEventHandler<HTMLAnchorElement>;
	} = $props();

	// The online dot already covers a profile that is online now.
	const seenLabel = $derived.by(() => {
		const now = getNow();
		if (!preferencesSnapshot().gridLastOnline) return null;
		if ((onlineUntil ?? 0) > now) return null;
		return seen === null ? "Offline" : formatTimeAgoShort(seen, now);
	});
</script>

{#snippet meta()}
	<span class="truncate">{seenLabel}</span>
{/snippet}

<ProfileMiniCard
	mediaHash={medias?.[0]?.mediaHash ?? null}
	{displayName}
	{age}
	{distance}
	{unread}
	{onlineUntil}
	{isFavorite}
	{isVisiting}
	{hadRecentChat}
	{rightNow}
	{note}
	meta={seenLabel === null ? undefined : meta}
	{onclick}
	href="/profile/{id}"
/>
