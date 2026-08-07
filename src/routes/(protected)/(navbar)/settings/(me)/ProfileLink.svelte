<script lang="ts">
	import { CaretRightIcon } from "phosphor-svelte";

	import { getProfile } from "$lib/api/users/profiles";
	import BrokenUserAvatar from "$lib/components/profile/BrokenUserAvatar.svelte";
	import DisplayName from "$lib/components/profile/DisplayName.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";

	let {
		id,
	}: {
		id: number;
	} = $props();

	const myProfile = $derived(getProfile(id));
	const myProfilePhotos = $derived(myProfile.then((profile) => profile.medias));
</script>

<!-- Hero card for the signed-in user: the same neutral surface as the group
     cards below it, distinguished by size rather than by tint. Dimensions are
     the handoff's (§ 07): 12×14 padding, a 48pt avatar, 13pt beside it. -->
<a
	href="/profile/{id}"
	class="flex items-center gap-3.25 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors active:bg-muted can-hover:hover:bg-muted"
>
	<!-- No ring: the avatar is the only round thing on the screen, so it needs
	     nothing to separate it from the card, and an accent ring reads as a status
	     the profile doesn't have. -->
	<span
		class="size-12 shrink-0 overflow-hidden rounded-full bg-media-placeholder"
	>
		{#await myProfilePhotos then photos}
			<UserAvatar
				mediaHash={photos[0]?.mediaHash ?? null}
				class="size-full *:rounded-full"
				size="lg"
			/>
		{:catch}
			<BrokenUserAvatar />
		{/await}
	</span>
	<span class="flex min-w-0 flex-1 flex-col gap-2">
		<span
			class="min-w-0 truncate font-heading text-body leading-none font-semibold"
		>
			{#await myProfile}
				<Skeleton class="h-3.5 w-32" />
			{:then profile}
				<DisplayName name={profile.displayName} />
			{:catch}
				<span class="text-muted-foreground italic">Failed to load name</span>
			{/await}
		</span>
		<span class="truncate text-preview leading-none text-muted-foreground">
			View and edit your profile
		</span>
	</span>
	<CaretRightIcon
		weight="bold"
		class="size-4 shrink-0 text-ink3 max-cramped:hidden"
	/>
</a>
