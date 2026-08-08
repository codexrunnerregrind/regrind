<script lang="ts">
	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import type { RightNowStatus } from "$lib/model/right-now";

	let {
		id,
		displayName = null,
		age = null,
		distance = null,
		medias = null,
		unread = null,
		onlineUntil = null,
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
		isFavorite?: boolean;
		isVisiting?: boolean;
		hadRecentChat?: boolean;
		rightNow?: RightNowStatus | null;
		note?: string | null;
		onclick?: import("svelte/elements").MouseEventHandler<HTMLAnchorElement>;
	} = $props();
</script>

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
	{onclick}
	href="/profile/{id}"
/>
