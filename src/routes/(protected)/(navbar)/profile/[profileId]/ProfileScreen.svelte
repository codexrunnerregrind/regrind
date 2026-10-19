<script lang="ts">
	import CameraIcon from "phosphor-svelte/lib/CameraIcon";
	import EyesIcon from "phosphor-svelte/lib/EyesIcon";
	import GlobeStandIcon from "phosphor-svelte/lib/GlobeStandIcon";
	import HouseIcon from "phosphor-svelte/lib/HouseIcon";
	import SparkleIcon from "phosphor-svelte/lib/SparkleIcon";
	import UsersIcon from "phosphor-svelte/lib/UsersIcon";
	import UsersThreeIcon from "phosphor-svelte/lib/UsersThreeIcon";
	import { untrack } from "svelte";

	import {
		BlockedProfileError,
		HiddenProfileError,
		ProfileUnavailableError,
	} from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import NotFound from "$lib/components/feedback/NotFound.svelte";
	import ProfileActivityPill from "$lib/components/profile/ProfileActivityPill.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		acceptNSFWPics,
		ethnicities,
		lookingFor as lookingForLabels,
		meetAt as meetAtLabels,
		relationshipStatuses,
		tribes,
	} from "$lib/model/users/profiles";
	import { profileMediaUrl } from "$lib/util/media";
	import AboutMe from "./AboutMe.svelte";
	import BlockedProfile from "./BlockedProfile.svelte";
	import Distance from "./Distance.svelte";
	import Genders from "./fields/GendersPronouns.svelte";
	import LookupField from "./fields/LookupField.svelte";
	import Socials from "./fields/Socials.svelte";
	import Height from "./HeightWeightBodyType.svelte";
	import HiddenProfile from "./HiddenProfile.svelte";
	import ImageCarousel from "./ImageCarousel.svelte";
	import OnlineStatus from "./OnlineStatus.svelte";
	import { ProfileState } from "./profile-state.svelte";
	import ProfileAlbums from "./ProfileAlbums.svelte";
	import ProfileHealth from "./ProfileHealth.svelte";
	import ProfileNote from "./ProfileNote.svelte";
	import ProfileRightNow from "./ProfileRightNow.svelte";
	import ProfileTags from "./ProfileTags.svelte";
	import RightNowStatus from "./RightNowStatus.svelte";
	import SexualPosition from "./SexualPosition.svelte";
	import SpecSeparator from "./SpecSeparator.svelte";
	import CloseProfileButton from "./top-nav/CloseProfileButton.svelte";
	import ProfileTopNavBar from "./top-nav/ProfileTopNavBar.svelte";

	let {
		profileId,
		ourProfileId,
		active = true,
		register,
	}: {
		profileId: number;
		ourProfileId: number;
		/**
		 * Whether this is the profile being looked at. The pager keeps the
		 * neighbours mounted so a swipe animates onto a loaded profile rather
		 * than a skeleton; they only count as viewed once they become active.
		 */
		active?: boolean;
		/**
		 * Lends this profile's state to the pager for as long as it is mounted,
		 * so the bottom bar — which lives outside the sliding track — can read
		 * and write the tap. Called with null on teardown.
		 */
		register?: (profileId: number, state: ProfileState | null) => void;
	} = $props();

	let profileContainer = $state<HTMLElement | null>(null);

	let profileState = $state(
		untrack(
			() =>
				new ProfileState({
					profileId,
					ourProfileId,
					recordView: active,
				}),
		),
	);

	$effect(() => {
		const id = profileId;
		const ourId = ourProfileId;

		const state = untrack(() => {
			if (
				id !== profileState.profileId ||
				ourId !== profileState.ourProfileId
			) {
				profileState = new ProfileState({
					profileId: id,
					ourProfileId: ourId,
					recordView: untrack(() => active),
				});
			}
			return profileState;
		});

		return () => state.destroy();
	});

	// Sticky: once swiped to, a profile stays fully loaded, so paging back to it
	// does not tear its albums down and fetch them again.
	let visited = $state(untrack(() => active));

	$effect(() => {
		if (!active) return;
		visited = true;
		profileState.markViewed();
	});

	$effect(() => {
		const state = profileState;
		register?.(state.profileId, state);
		return () => register?.(state.profileId, null);
	});

	const profile = $derived(profileState.profile);
	const error = $derived(profileState.error);
	const ourProfile = $derived(profileState.isOurProfile);
</script>

{#if error}
	<div class="flex flex-1">
		{#if error instanceof BlockedProfileError}
			<BlockedProfile
				profileId={profileState.profileId}
				blockedByUs={error.blockedByUs}
				markViewable={() => profileState.markViewable()}
			/>
		{:else if error instanceof HiddenProfileError}
			<HiddenProfile
				profileId={profileState.profileId}
				changingViewability={profileState.changingViewability}
				markViewable={() => profileState.markViewable()}
			/>
		{:else if error instanceof ProfileUnavailableError}
			<NotFound />
		{:else}
			<ApiErrorDisplay
				{error}
				onRetry={() => profileState.retry()}
				class="m-auto"
			/>
		{/if}
	</div>
{:else}
	<div class="relative h-full">
		<div
			class="h-full overflow-y-auto overscroll-contain"
			bind:this={profileContainer}
		>
			<main
				class="relative mx-auto min-h-overscrollable w-full max-w-200"
			>
				{#if profileState.loading || !profile}
					<div class="relative flex max-w-full flex-col">
						<Skeleton
							class="aspect-3/4 h-auto max-h-photo w-full rounded-none"
						/>

						<div
							class={[
								"flex max-w-full flex-col gap-3.5 p-4",
								{ "pb-24": ourProfile, "pb-40": !ourProfile },
							]}
						>
							<Skeleton class="h-6 w-40 max-w-full" />
							<Skeleton class="h-3 w-30 max-w-full" />
							<Skeleton class="mt-0.5 h-3 w-50 max-w-full" />
							<div class="mt-2 flex flex-wrap gap-1">
								{#each [10, 12, 18, 16, 15] as w, i (i)}
									<Skeleton
										class="h-4.5 w-(--w)"
										--w="calc(var(--spacing) * {w})"
									/>
								{/each}
							</div>
							<Skeleton class="mt-2.25 h-27 w-full rounded-4xl" />
						</div>
					</div>
				{:else}
					{@const {
						displayName,
						age,
						onlineUntil,
						seen,
						distance,
						sexualPosition,
						height,
						weight,
						bodyType,
						profileTags,
						aboutMe,
						genders,
						pronouns,
						ethnicity,
						relationshipStatus,
						grindrTribes,
						tribesImInto,
						lookingFor,
						meetAt,
						nsfw,
						socialNetworks,
						medias,
						isNew,
						rightNow,
						rightNowText,
						rightNowThumbnailUrl,
						rightNowFullImageUrl,
					} = profile}
					<div class="relative">
						<ImageCarousel
							{medias}
							{profileId}
							{ourProfileId}
							{displayName}
							self={ourProfile}
						/>
						{#if !ourProfile}
							<ProfileNote
								{profileId}
								isFavorite={profile.isFavorite}
							/>
							<ProfileActivityPill
								{profileId}
								tappedAt={profile.lastReceivedTapTimestamp}
								chattedAt={profile.lastChatTimestamp}
							/>
						{/if}
					</div>
					<ProfileTopNavBar
						{ourProfile}
						{profile}
						changingViewability={profileState.changingViewability}
						markBlocked={() => profileState.markBlocked()}
						markHidden={() => profileState.markHidden()}
						onFavorite={(isFavorite) =>
							profileState.setFavorite(isFavorite)}
					/>
					<div
						class={[
							"flex flex-col px-5 pt-5",
							{ "pb-24": ourProfile, "pb-40": !ourProfile },
						]}
					>
						<h1 class="screen-title wrap-break-word">
							{#if displayName !== null}
								<span class="font-semibold">
									{displayName}
								</span>{:else}<span
									class="font-normal tracking-tight text-muted-foreground italic"
								>
									Someone
								</span>{/if}{#if age !== null}, {age}
							{/if}
						</h1>
						<div
							class="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-caption"
						>
							<OnlineStatus
								onlineUntil={onlineUntil ?? null}
								{seen}
								self={ourProfile}
							/>
							<Distance {distance} />
							<RightNowStatus {rightNow} />
							{#if isNew}
								<span
									class="flex shrink-0 items-center gap-1 font-semibold text-primary"
								>
									<SparkleIcon
										weight="fill"
										class="size-3.5"
									/>
									Recently joined
								</span>
							{/if}
						</div>
						<ProfileRightNow
							text={rightNowText}
							thumbnailUrl={rightNowThumbnailUrl}
							fullImageUrl={rightNowFullImageUrl}
							{profileId}
							{displayName}
							self={ourProfile}
						/>
						{#if sexualPosition !== null || height !== null || weight !== null || bodyType !== null}
							<div
								class="mt-3 flex flex-wrap items-center gap-2 text-caption font-medium"
							>
								{#if sexualPosition !== null && sexualPosition !== undefined}
									<SexualPosition {sexualPosition} />
									{#if height !== null || weight !== null || bodyType !== null}
										<SpecSeparator />
									{/if}
								{/if}
								<Height {height} {weight} {bodyType} />
							</div>
						{/if}
						<ProfileTags tags={profileTags} />
						{#if aboutMe !== null}
							<AboutMe>{aboutMe}</AboutMe>
						{/if}
						{#if (genders && genders.length > 0) || (pronouns && pronouns.length > 0) || ethnicity !== null || relationshipStatus !== null || (grindrTribes && grindrTribes.length > 0)}
							<div class="mt-5.5 flex flex-col gap-2.75">
								<span class="section-label">Stats</span>
								<Genders {genders} {pronouns} />
								<LookupField
									icon={UsersThreeIcon}
									value={grindrTribes}
									options={tribes}
								/>
								<LookupField
									icon={GlobeStandIcon}
									value={ethnicity}
									options={ethnicities}
								/>
								<LookupField
									icon={UsersIcon}
									value={relationshipStatus}
									options={relationshipStatuses}
								/>
							</div>
						{/if}
						{#if (tribesImInto && tribesImInto.length > 0) || (lookingFor && lookingFor.length > 0) || (meetAt && meetAt.length > 0) || nsfw !== null}
							<div class="mt-5.5 flex flex-col gap-2.75">
								<span class="section-label">Expectations</span>
								<LookupField
									icon={UsersThreeIcon}
									label="I'm Into"
									value={tribesImInto}
									options={tribes}
								/>
								<LookupField
									icon={EyesIcon}
									weight="fill"
									label="Looking For"
									value={lookingFor}
									options={lookingForLabels}
								/>
								<LookupField
									icon={HouseIcon}
									label="Meet At"
									value={meetAt}
									options={meetAtLabels}
								/>
								<LookupField
									icon={CameraIcon}
									label="NSFW Pics?"
									value={nsfw}
									options={acceptNSFWPics}
								/>
							</div>
						{/if}
						<ProfileAlbums
							{profileId}
							self={ourProfile}
							enabled={visited}
							sharer={{
								name: displayName,
								avatarUrl: medias[0]
									? profileMediaUrl({
											mediaHash: medias[0].mediaHash,
											size: "thumb",
										})
									: null,
								// The profile carries metres; the viewer's header wants km.
								distanceKm:
									distance === null ? null : distance / 1000,
							}}
						/>
						<ProfileHealth {profile} />
						{#if socialNetworks && Object.keys(socialNetworks).length > 0}
							<div class="mt-5.5 flex flex-col gap-2.75">
								<span class="section-label">Socials</span>
								<Socials socials={socialNetworks} />
							</div>
						{/if}
					</div>
				{/if}
			</main>
		</div>
		<!-- Outside the scroller too, for the same reason as the bottom bar: it
		     stays put over the photo while the profile scrolls under it, and
		     anchoring it to the pane rather than the viewport keeps it with this
		     profile as the pager slides. The wrapper mirrors the content's max
		     width so the glyph stays on the photo's corner on wide screens. -->
		<div
			class="pointer-events-none absolute inset-0 mx-auto w-full max-w-200"
		>
			<CloseProfileButton {active} />
		</div>
		<!-- No bottom bar here: it is rendered once by the pager, outside the
		     sliding track, so it can stay viewport-fixed. See ProfilePager. -->
		<DataRefreshControl
			container={profileContainer}
			updating={profileState.refreshing}
			position="top"
			onrefresh={() => profileState.refresh()}
		/>
	</div>
{/if}
