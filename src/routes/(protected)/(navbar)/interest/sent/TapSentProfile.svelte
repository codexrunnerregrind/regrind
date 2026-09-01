<script lang="ts">
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import FavoriteStar from "$lib/components/profile/FavoriteStar.svelte";
	import ProfileItem from "$lib/components/profile/ProfileItem.svelte";
	import TapIcon from "$lib/components/profile/TapIcon.svelte";
	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import * as Item from "$lib/components/ui/item";
	import type { SentTapProfile } from "$lib/model/interest/sent-tap";

	let {
		tap,
		onclick = undefined,
	}: {
		tap: SentTapProfile;
		onclick?: import("svelte/elements").MouseEventHandler<HTMLAnchorElement>;
	} = $props();
</script>

{#snippet favorite()}
	<FavoriteStar />
{/snippet}

<ProfileItem
	avatar={{ mediaHash: tap.profileImageMediaHash }}
	title={{
		value: tap.displayName,
		badge: tap.isFavorite ? favorite : undefined,
	}}
	onlineUntil={tap.onlineUntil}
	link="/profile/{tap.profileId}"
	{onclick}
>
	{#snippet description()}
		<Item.Description class="text-muted-foreground">
			{#if tap.distance !== null}
				<DistanceFormatted distance={tap.distance} />
			{/if}
		</Item.Description>
	{/snippet}
	{#snippet actions()}
		<Item.Actions
			class="flex min-w-6 flex-col items-end gap-1 @max-row:hidden"
		>
			<span
				class="max-w-full truncate text-right text-meta font-medium text-ink3"
			>
				<RelativeTimeDynamic date={tap.sentOn} />
			</span>
			{#if tap.tapType !== null}
				<TapIcon tapType={tap.tapType} sent class="size-4" />
			{/if}
		</Item.Actions>
	{/snippet}
</ProfileItem>
