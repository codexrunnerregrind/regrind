<script lang="ts">
	import { UsersThreeIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { setAlbumShared } from "$lib/api/messaging/album-shares-state.svelte";
	import { getAlbumShares, unshareAlbum } from "$lib/api/messaging/albums";
	import { getProfiles } from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ProfileItem from "$lib/components/profile/ProfileItem.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";

	let {
		albumId,
		onSharedCountChange,
	}: {
		albumId: number;
		onSharedCountChange?: (count: number) => void;
	} = $props();

	type Share = {
		profileId: number;
		name: string | null;
		mediaHash: string | null;
	};

	// An album can be shared with hundreds of profiles, and resolving them costs
	// a request per 150, so only a page is resolved at a time.
	const PAGE_SIZE = 60;

	// Revoking hundreds of shares in one request is asking for a rejected body,
	// so the bulk unshare goes out in batches.
	const UNSHARE_BATCH_SIZE = 50;

	let sharedIds = $state<number[] | null>(null);
	let shares = $state<Share[]>([]);
	let error = $state<unknown>(null);
	let loadingMore = $state(false);
	let revoking = $state<number | null>(null);
	let unshareAllOpen = $state(false);
	let unsharingAll = $state(false);

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
			onSharedCountChange?.(profileIds.length);
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
		if (revoking !== null || unsharingAll) return;
		const previousShares = shares;
		const previousIds = sharedIds;
		revoking = profileId;
		shares = previousShares.filter((share) => share.profileId !== profileId);
		// Drop it from the id list too, or the count and paging would still
		// include a profile that is no longer shared with.
		sharedIds = previousIds?.filter((id) => id !== profileId) ?? null;
		if (sharedIds !== null) onSharedCountChange?.(sharedIds.length);
		try {
			await unshareAlbum({ albumId, profileIds: [profileId] });
			setAlbumShared(albumId, profileId, false);
			toast.success("Album unshared");
		} catch (err) {
			console.error(err);
			shares = previousShares;
			sharedIds = previousIds;
			if (previousIds !== null) onSharedCountChange?.(previousIds.length);
			showErrorToast({ label: "Failed to unshare album", error: err });
		} finally {
			revoking = null;
		}
	}

	async function unshareAll() {
		const ids = sharedIds;
		if (ids === null || ids.length === 0 || unsharingAll || revoking !== null) {
			return;
		}
		unsharingAll = true;
		try {
			for (let i = 0; i < ids.length; i += UNSHARE_BATCH_SIZE) {
				const batch = ids.slice(i, i + UNSHARE_BATCH_SIZE);
				await unshareAlbum({ albumId, profileIds: batch });
				for (const profileId of batch)
					setAlbumShared(albumId, profileId, false);
			}
			sharedIds = [];
			shares = [];
			onSharedCountChange?.(0);
			unshareAllOpen = false;
			toast.success("Album unshared with everyone");
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to unshare album", error: err });
			// An earlier batch may already have gone through, so the local list is
			// no longer trustworthy — take the server's word for what is left.
			unshareAllOpen = false;
			await load(albumId);
		} finally {
			unsharingAll = false;
		}
	}
</script>

<div class="flex flex-col gap-2">
	<!-- The action sits by the heading, not under the list: the list can run to
	     hundreds of profiles, and anything below it is effectively unreachable. -->
	<div class="flex min-h-8 items-center justify-between gap-2">
		<span class="text-sm text-muted-foreground uppercase">
			Shared with{#if sharedIds !== null && sharedIds.length > 0}
				&nbsp;({sharedIds.length}){/if}
		</span>
		{#if error === null && sharedIds !== null && sharedIds.length > 0}
			<Button
				variant="ghost"
				size="sm"
				class="-me-2 shrink-0 gap-1.5 text-destructive hover:text-destructive"
				disabled={unsharingAll || revoking !== null}
				onclick={() => (unshareAllOpen = true)}
			>
				<UsersThreeIcon class="size-4" />
				Unshare all
			</Button>
		{/if}
	</div>
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
							disabled={revoking !== null || unsharingAll}
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
				disabled={loadingMore || unsharingAll}
				onclick={() => void loadMore()}
			>
				{loadingMore
					? "Loading…"
					: `Show ${Math.min(remaining, PAGE_SIZE)} more`}
			</Button>
		{/if}
	{/if}
</div>

<AlertDialog.Root bind:open={unshareAllOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Unshare with everyone?</AlertDialog.Title>
			<AlertDialog.Description>
				{#if sharedIds !== null && sharedIds.length > 0}
					{sharedIds.length}
					{sharedIds.length === 1 ? "person" : "people"} will lose access to this
					album. The album itself is kept.
				{:else}
					Everyone will lose access to this album. The album itself is kept.
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={unsharingAll}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				disabled={unsharingAll}
				onclick={(event) => {
					// Kept open so the dialog can stay disabled until every batch lands.
					event.preventDefault();
					void unshareAll();
				}}
			>
				{unsharingAll ? "Unsharing…" : "Unshare all"}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
