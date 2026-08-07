<script lang="ts">
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";

	import { getProfile } from "$lib/api/users/profiles";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";

	let {
		profileId,
		photoHash,
		toastId,
	}: { profileId: number; photoHash: string | null; toastId: string } =
		$props();

	// The socket payload carries a photo but no name, so the name is filled in
	// once the profile resolves. The bubble is short-lived — it renders with the
	// photo straight away rather than waiting on the fetch.
	const displayName = $derived(
		getProfile(profileId).then((profile) => profile.displayName),
	);
</script>

<button
	type="button"
	class="mx-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-popover py-1.5 ps-1.5 pe-4 text-start shadow-lg"
	onclick={() => {
		toast.dismiss(toastId);
		void goto("/interest/views");
	}}
>
	<UserAvatar
		mediaHash={photoHash}
		class="size-9 shrink-0 overflow-hidden rounded-full bg-media-placeholder *:rounded-full"
	/>
	<span class="flex min-w-0 flex-col">
		<span class="truncate font-heading text-sm leading-snug font-medium">
			{#await displayName}
				Someone
			{:then name}
				{name?.trim() || "Someone"}
			{:catch}
				Someone
			{/await}
		</span>
		<span class="truncate text-xs leading-snug text-muted-foreground">
			viewed your profile
		</span>
	</span>
</button>
