<script lang="ts">
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";

	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import ProfileStatusIndicator from "$lib/components/profile/ProfileStatusIndicator.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import type { MatchesMatch } from "$lib/model/interest/matches";
	import SexualPosition from "../../profile/[profileId]/SexualPosition.svelte";

	let { match }: { match: MatchesMatch } = $props();

	const sourceText = $derived.by(() => {
		if (match.source === "MUTUAL_TAP") {
			return "You've tapped each other!";
		}
		if (match.source === "VIEW_YOUR_TYPE") {
			return "Viewed you+your type";
		}
		if (match.source === "TAP_YOUR_TYPE") {
			return "Tapped you+your type";
		}
	});
</script>

{#snippet content()}
	<div class="absolute size-full bg-media-placeholder">
		<UserAvatar
			mediaHash={match.profile.profileImageMediaHash}
			class="size-full"
			size="xl"
		/>
	</div>

	<div
		class={[
			"tile-scrim z-1 flex min-w-0 items-end gap-1",
			{ "tile-scrim-tall": true },
		]}
	>
		<div class="flex min-w-0 flex-1 flex-col">
			<div class="text-sm">
				{#if match.profile.displayName !== null}
					<span class="truncate font-bold">
						{match.profile.displayName}
					</span>
				{/if}
				{#if match.profile.displayName !== null && match.profile.age !== null}
					<span class="font-semibold">,&nbsp;</span>
				{/if}
				{#if match.profile.age !== null}
					<span class="shrink-0">
						{match.profile.age}
					</span>
				{/if}
			</div>

			<div class="flex min-w-0 items-center text-xs">
				<ProfileStatusIndicator
					onlineUntil={match.profile.onlineUntil}
					isVisiting={match.profile.visitingStatus}
					class="size-2"
				/>
				{#if match.profile.distance !== null}
					<NavigationArrowIcon
						class="inline-block size-2 -scale-x-100"
						aria-hidden="true"
						weight="fill"
					/>
					<span class="sr-only">Distance:</span>
					<DistanceFormatted distance={match.profile.distance} />
				{/if}
				{#if match.profile.position !== null}
					<SexualPosition sexualPosition={match.profile.position} />
				{/if}
			</div>

			<div class="flex min-w-0 items-center text-xs">
				{sourceText}
			</div>
		</div>
	</div>
{/snippet}

<a
	href="/profile/{match.profile.profileId}"
	class="relative flex aspect-[3/4] items-end overflow-hidden"
>
	{@render content()}
</a>

<style lang="postcss">
	@reference "$layout";

	/* A tile's corner status glyph. */
	:global(.marker) {
		@apply size-3.5 shrink-0;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.6));
	}
</style>
