<script lang="ts">
	import DisplayName from "$lib/components/profile/DisplayName.svelte";
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import ProfileStatusIndicator from "$lib/components/profile/ProfileStatusIndicator.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import * as Avatar from "$lib/components/ui/avatar";
	import * as Card from "$lib/components/ui/card";
	import {
		appendProfileTransitionQueryParam,
		getProfileTransitionName,
	} from "$lib/platform/view-transitions";
	import type { ConversationProfile } from "../conversation-state.svelte";

	const TRANSITION_NAME = "conversationNavBar";

	let {
		profile,
		typing = false,
	}: { profile: ConversationProfile; typing?: boolean } = $props();

	const hrefWithTransitionQueryParam = $derived.by(() => {
		const href = `/profile/${profile.profileId}`;
		if (!profile.mediaHash) return href;
		return appendProfileTransitionQueryParam(
			href,
			TRANSITION_NAME,
			profile.mediaHash,
		);
	});

	const transitionName = $derived(
		getProfileTransitionName(TRANSITION_NAME, profile.mediaHash),
	);
</script>

<a href={hrefWithTransitionQueryParam} class="flex-1 py-4 ps-1 pe-2">
	<Card.Header class="flex items-center gap-3 px-0">
		<Avatar.Root class="size-avatar after:rounded-full">
			<UserAvatar
				mediaHash={profile.mediaHash ?? null}
				{transitionName}
				class="size-full *:rounded-full"
				size="lg"
			/>
		</Avatar.Root>
		<div class="flex min-w-0 flex-col">
			<Card.Title
				class={[
					"flex min-w-0 items-center gap-1 text-row font-semibold",
					{ "text-muted-foreground": !profile.name },
				]}
			>
				<ProfileStatusIndicator onlineUntil={profile.onlineUntil} />
				<DisplayName name={profile.name} class="truncate" />
			</Card.Title>
			{#if typing}
				<Card.Description
					data-slot="conversation-typing"
					class="truncate text-meta font-medium text-primary"
				>
					Typing…
				</Card.Description>
			{:else if profile.distance === null}
				<Card.Description class="truncate text-meta text-ink3">
					Distance unknown
				</Card.Description>
			{:else}
				<Card.Description class="truncate text-meta text-ink3">
					<DistanceFormatted distance={profile.distance} />
				</Card.Description>
			{/if}
		</div>
	</Card.Header>
</a>
