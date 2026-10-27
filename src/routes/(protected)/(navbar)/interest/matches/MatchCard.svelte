<script lang="ts">
	import {
		type MatchesCardStyle,
		preferencesSnapshot,
	} from "$lib/app-data/preferences.svelte";
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import TapIcon from "$lib/components/profile/TapIcon.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import {
		sexualPositions,
		sexualPositionSchema,
	} from "$lib/model/users/profiles";
	import { getNow } from "$lib/util/now";
	import { formatHeight, formatWeightGrams } from "$lib/util/units";
	import type { MatchesMatch } from "$lib/model/interest/matches";
	import type { SentTapProfile } from "$lib/model/interest/sent-tap";
	import MatchReasonIcon from "./MatchReasonIcon.svelte";

	let {
		match,
		style,
		sentTap,
	}: {
		match: MatchesMatch;
		style: MatchesCardStyle;
		/** Our tap to them, from the sent list; fresher than `profile.tapped`. */
		sentTap?: SentTapProfile;
	} = $props();

	const profile = $derived(match.profile);

	const reasons: Partial<Record<string, string>> = {
		MUTUAL_TAP: "Tapped each other",
		MUTUAL_VIEW: "Viewed each other",
		MUTUAL_VIEWS: "Viewed each other",
		TAP_YOUR_TYPE: "Tapped you + your type",
		VIEW_YOUR_TYPE: "Viewed you + your type",
	};
	const reason = $derived(reasons[match.source] ?? "Best match");
	const reasonKind = $derived(match.source.includes("TAP") ? "tap" : "view");

	const title = $derived(
		[profile.displayName, profile.age]
			.filter((part) => part !== null)
			.join(", "),
	);
	const tapped = $derived(sentTap !== undefined || profile.tapped === true);
	const online = $derived((profile.onlineUntil ?? 0) > getNow());

	const stats = $derived.by(() => {
		const units = preferencesSnapshot().units;
		const position = sexualPositionSchema.safeParse(profile.position).data;
		return [
			position === undefined ? null : sexualPositions[position],
			profile.height === null
				? null
				: formatHeight(profile.height, units),
			profile.weight === null
				? null
				: formatWeightGrams(profile.weight, units),
		]
			.filter((part) => part !== null)
			.join(" · ");
	});
</script>

{#snippet tapBadge(position: string, size: string)}
	<span
		class={[
			"absolute flex items-center justify-center rounded-full bg-plate text-plate-foreground",
			position,
		]}
	>
		{#if sentTap !== undefined && sentTap.tapType !== null}
			<TapIcon tapType={sentTap.tapType} sent class="size-3.5" />
		{:else}
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.4"
				stroke-linejoin="round"
				class={size}
				aria-hidden="true"
			>
				<path
					d="M8 14.5c2.8 0 4.8-1.9 4.8-4.6 0-2.9-2.3-4.4-3.2-7.4-1.6 1.2-2.2 2.8-2 4.3C6.8 6.2 6.2 5.4 6 4.4 4.3 5.8 3.2 7.6 3.2 9.9c0 2.7 2 4.6 4.8 4.6Z"
				/>
			</svg>
			<span class="sr-only">You tapped</span>
		{/if}
	</span>
{/snippet}

{#if style === "full"}
	<a
		href="/profile/{profile.profileId}"
		class="relative block aspect-3/4 overflow-hidden bg-media-placeholder"
	>
		<UserAvatar
			mediaHash={profile.profileImageMediaHash}
			class="absolute inset-0 size-full"
			size="xl"
		/>

		{#if tapped}
			{@render tapBadge("top-2.25 right-2.25 size-6.5", "size-3.5")}
		{/if}
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-linear-to-b from-transparent to-plate-scrim px-2.5 pt-9 pb-2.75 text-meta/[1.2] text-plate-muted"
		>
			{#if title}
				<div
					class="truncate text-caption/[1.1] font-semibold text-plate-foreground"
				>
					{title}
				</div>
			{/if}
			{#if online || profile.distance !== null}
				<div
					class="flex items-center gap-1.5 font-medium whitespace-nowrap"
				>
					{#if online}
						<span class="flex items-center gap-1.25 text-online">
							<span class="size-1.5 rounded-full bg-online"
							></span>
							Online
						</span>
					{/if}
					{#if online && profile.distance !== null}
						<span class="text-ink3">·</span>
					{/if}
					{#if profile.distance !== null}
						<span
							><DistanceFormatted
								distance={profile.distance}
							/></span
						>
					{/if}
				</div>
			{/if}
			{#if stats}
				<div class="truncate">{stats}</div>
			{/if}
			<div
				class="mt-0.5 flex min-w-0 items-center gap-1.25 font-medium text-plate-foreground"
			>
				<MatchReasonIcon
					kind={reasonKind}
					class="size-3 text-plate-accent"
				/>
				<span class="truncate">{reason}</span>
			</div>
		</div>
	</a>
{:else}
	<!-- The browse grid's own tile, so compact reads exactly like the grid. -->
	<ProfileMiniCard
		mediaHash={profile.profileImageMediaHash}
		displayName={profile.displayName}
		age={profile.age}
		distance={profile.distance}
		onlineUntil={profile.onlineUntil}
		isVisiting={profile.visitingStatus ?? false}
		href="/profile/{profile.profileId}"
	>
		{#snippet overlay()}
			{#if tapped}
				{@render tapBadge(
					"top-plate left-plate z-1 size-5.5",
					"size-3",
				)}
			{/if}
			<span class="absolute right-2.25 bottom-2 z-1">
				<MatchReasonIcon
					kind={reasonKind}
					class="size-3 text-plate-accent"
				/>
				<span class="sr-only">{reason}</span>
			</span>
		{/snippet}
	</ProfileMiniCard>
{/if}
