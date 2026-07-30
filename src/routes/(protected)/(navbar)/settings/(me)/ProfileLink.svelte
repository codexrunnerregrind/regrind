<script lang="ts">
	import { CaretRightIcon } from "phosphor-svelte";

	import { getMyProfile } from "$lib/api/users/profiles";
	import BrokenUserAvatar from "$lib/components/profile/BrokenUserAvatar.svelte";
	import DisplayName from "$lib/components/profile/DisplayName.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";

	let {
		id,
	}: {
		id: number;
	} = $props();

	const myProfile = $derived(getMyProfile());
	const myProfilePhotos = $derived(myProfile.then((profile) => profile.medias));
</script>

<!-- Hero card for the signed-in user: the same neutral surface as the group
     cards below it, distinguished by size rather than by tint. -->
<a
	href="/profile/{id}"
	class="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors active:bg-muted can-hover:hover:bg-muted"
>
	<span
		class="size-16 shrink-0 overflow-hidden rounded-full bg-media-placeholder ring-2 ring-primary/25"
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
	<span class="flex min-w-0 flex-1 flex-col gap-1">
		<span
			class="min-w-0 truncate font-heading text-title leading-tight font-semibold"
		>
			{#await myProfile}
				<Skeleton class="my-1 h-4 w-32" />
			{:then profile}
				<DisplayName name={profile.displayName} />
			{:catch}
				<span class="text-muted-foreground italic">Failed to load name</span>
			{/await}
		</span>
		<span class="truncate text-caption text-muted-foreground">
			View and edit your profile
		</span>
	</span>
	<CaretRightIcon
		weight="bold"
		class="size-4 shrink-0 text-muted-foreground/60 max-cramped:hidden"
	/>
</a>
