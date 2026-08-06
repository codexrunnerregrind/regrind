<script lang="ts">
	import { toast } from "svelte-sonner";

	import { getBlockedUsers, unblockUser } from "$lib/api/browse/blocks";
	import { showErrorToast } from "$lib/api/error-toast";
	import { getProfiles } from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ProfileItem from "$lib/components/profile/ProfileItem.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Item from "$lib/components/ui/item";
	import { Skeleton } from "$lib/components/ui/skeleton";

	type BlockedUser = {
		profileId: number;
		name: string | null;
		mediaHash: string | null;
		// True when the profile batch had nothing for this id. Blocking hides a
		// profile from us too, so this is the common case rather than the odd one.
		unresolved: boolean;
	};

	// Resolving profiles costs a request per 150 ids, and a long-standing account
	// can have hundreds blocked, so only a page is resolved at a time.
	const PAGE_SIZE = 60;

	let blockedIds = $state<number[] | null>(null);
	let blocked = $state<BlockedUser[]>([]);
	let error = $state<unknown>(null);
	let loadingMore = $state(false);
	let unblocking = $state<number | null>(null);

	const remaining = $derived((blockedIds?.length ?? 0) - blocked.length);

	async function resolvePage(ids: number[]): Promise<BlockedUser[]> {
		const profiles = await getProfiles(ids);
		const byId = new Map(profiles.map((p) => [p.profileId, p]));
		// Keep every id, resolved or not: an entry that can't be hydrated is the
		// one that most needs to be here, since its profile page is unreachable.
		return ids.map((profileId) => {
			const profile = byId.get(profileId);
			return {
				profileId,
				name: profile?.displayName ?? null,
				mediaHash: profile?.medias?.[0]?.mediaHash ?? null,
				unresolved: profile === undefined,
			};
		});
	}

	async function load() {
		blockedIds = null;
		blocked = [];
		error = null;
		try {
			const blocking = await getBlockedUsers();
			const ids = blocking.map((entry) => entry.profileId);
			blockedIds = ids;
			if (ids.length > 0) blocked = await resolvePage(ids.slice(0, PAGE_SIZE));
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	async function loadMore() {
		if (blockedIds === null || loadingMore || remaining <= 0) return;
		loadingMore = true;
		try {
			const next = blockedIds.slice(blocked.length, blocked.length + PAGE_SIZE);
			blocked = [...blocked, ...(await resolvePage(next))];
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to load more", error: err });
		} finally {
			loadingMore = false;
		}
	}

	async function unblock(profileId: number) {
		if (unblocking !== null) return;
		const previousBlocked = blocked;
		const previousIds = blockedIds;
		unblocking = profileId;
		blocked = previousBlocked.filter((user) => user.profileId !== profileId);
		// Drop it from the id list too, or the count and paging would still include
		// someone who is no longer blocked.
		blockedIds = previousIds?.filter((id) => id !== profileId) ?? null;
		try {
			await unblockUser({ profileId });
			toast.success("User unblocked");
		} catch (err) {
			console.error(err);
			blocked = previousBlocked;
			blockedIds = previousIds;
			showErrorToast({ label: "Failed to unblock user", error: err });
		} finally {
			unblocking = null;
		}
	}

	void load();
</script>

{#if error !== null}
	<ApiErrorDisplay {error} onRetry={() => void load()} class="my-2" />
{:else if blockedIds === null}
	<div class="flex flex-col gap-2">
		{#each Array(3)}
			<Skeleton class="h-22 w-full rounded-xl" />
		{/each}
	</div>
{:else if blockedIds.length === 0}
	<span class="text-sm text-muted-foreground">
		You haven't blocked anyone.
	</span>
{:else}
	<div class="flex flex-col">
		{#each blocked as user (user.profileId)}
			<ProfileItem
				avatar={{ mediaHash: user.mediaHash }}
				title={{ value: user.name }}
				link="/profile/{user.profileId}"
			>
				{#snippet description()}
					{#if user.unresolved}
						<Item.Description class="text-muted-foreground">
							Profile {user.profileId}
						</Item.Description>
					{/if}
				{/snippet}
				{#snippet actions()}
					<Item.Actions class="pe-4">
						<Button
							variant="outline"
							size="sm"
							disabled={unblocking !== null}
							onclick={(event) => {
								// The row is a link to the profile, and this button sits inside
								// it — without this, unblocking would navigate away too.
								event.preventDefault();
								event.stopPropagation();
								void unblock(user.profileId);
							}}
						>
							Unblock
						</Button>
					</Item.Actions>
				{/snippet}
			</ProfileItem>
		{/each}
	</div>
	{#if remaining > 0}
		<Button
			variant="outline"
			class="mt-3 w-full"
			disabled={loadingMore}
			onclick={() => void loadMore()}
		>
			{loadingMore ? "Loading…" : `Show ${Math.min(remaining, PAGE_SIZE)} more`}
		</Button>
	{/if}
{/if}
