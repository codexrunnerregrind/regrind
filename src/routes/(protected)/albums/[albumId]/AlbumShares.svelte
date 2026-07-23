<script lang="ts">
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import { setAlbumShared } from "$lib/api/messaging/album-shares-state.svelte";
	import { getAlbumShares, unshareAlbum } from "$lib/api/messaging/albums";
	import { getProfiles } from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ProfileItem from "$lib/components/profile/ProfileItem.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";

	let { albumId }: { albumId: number } = $props();

	type Share = {
		profileId: number;
		name: string | null;
		mediaHash: string | null;
	};

	// An album can be shared with hundreds of profiles, and resolving them costs
	// a request per 150, so only a page is resolved at a time.
	const PAGE_SIZE = 60;

	let sharedIds = $state<number[] | null>(null);
	let shares = $state<Share[]>([]);
	let error = $state<unknown>(null);
	let loadingMore = $state(false);
	let revoking = $state<number | null>(null);

	const remaining = $derived((sharedIds?.length ?? 0) - shares.length);

	async function resolvePage(ids: number[]) {
		const profiles = await getProfiles(ids);
		const byId = new Map(profiles.map((p) => [p.profileId, p]));
		// Keep any id the profile lookup didn't return, so a share is never
		// silently hidden just because its profile could not be resolved.
		return ids.map((profileId) => {
			const profile = byId.get(profileId);
			return {
				profileId,
				name: profile?.displayName ?? null,
				mediaHash: profile?.medias?.[0]?.mediaHash ?? null,
			};
		});
	}

	async function load(id: number) {
		sharedIds = null;
		shares = [];
		error = null;
		try {
			const profileIds = await getAlbumShares(id);
			sharedIds = profileIds;
			if (profileIds.length > 0) {
				shares = await resolvePage(profileIds.slice(0, PAGE_SIZE));
			}
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	async function loadMore() {
		if (sharedIds === null || loadingMore || remaining <= 0) return;
		loadingMore = true;
		try {
			const next = sharedIds.slice(shares.length, shares.length + PAGE_SIZE);
			shares = [...shares, ...(await resolvePage(next))];
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to load more", error: err });
		} finally {
			loadingMore = false;
		}
	}

	$effect(() => {
		void load(albumId);
	});

	async function revoke(profileId: number) {
		if (revoking !== null) return;
		const previousShares = shares;
		const previousIds = sharedIds;
		revoking = profileId;
		shares = previousShares.filter((share) => share.profileId !== profileId);
		// Drop it from the id list too, or the count and paging would still
		// include a profile that is no longer shared with.
		sharedIds = previousIds?.filter((id) => id !== profileId) ?? null;
		try {
			await unshareAlbum({ albumId, profileIds: [profileId] });
			setAlbumShared(albumId, profileId, false);
			toast.success("Album unshared");
		} catch (err) {
			console.error(err);
			shares = previousShares;
			sharedIds = previousIds;
			showErrorToast({ label: "Failed to unshare album", error: err });
		} finally {
			revoking = null;
		}
	}
</script>

<div class="flex flex-col gap-2">
	<span class="text-sm text-muted-foreground uppercase">
		Shared with{#if sharedIds !== null && sharedIds.length > 0}
			&nbsp;({sharedIds.length}){/if}
	</span>
	{#if error !== null}
		<ApiErrorDisplay {error} onRetry={() => void load(albumId)} class="my-2" />
	{:else if sharedIds === null}
		<div class="flex flex-col gap-2">
			{#each Array(2)}
				<Skeleton class="h-14 w-full rounded-xl" />
			{/each}
		</div>
	{:else if sharedIds.length === 0}
		<span class="text-sm text-muted-foreground">
			This album isn't shared with anyone.
		</span>
	{:else}
		<div class="flex flex-col gap-2">
			{#each shares as share (share.profileId)}
				<ProfileItem
					avatar={{ mediaHash: share.mediaHash }}
					title={{ value: share.name }}
					link="/profile/{share.profileId}"
				>
					{#snippet actions()}
						<Button
							variant="outline"
							size="sm"
							disabled={revoking !== null}
							onclick={() => void revoke(share.profileId)}
						>
							Unshare
						</Button>
					{/snippet}
				</ProfileItem>
			{/each}
		</div>
		{#if remaining > 0}
			<Button
				variant="outline"
				class="w-full"
				disabled={loadingMore}
				onclick={() => void loadMore()}
			>
				{loadingMore
					? "Loading…"
					: `Show ${Math.min(remaining, PAGE_SIZE)} more`}
			</Button>
		{/if}
	{/if}
</div>
