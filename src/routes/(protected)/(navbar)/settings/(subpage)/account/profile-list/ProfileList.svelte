<script lang="ts">
	import { beforeNavigate } from "$app/navigation";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getProfiles } from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ProfileActionRow from "$lib/components/profile/ProfileActionRow.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { nearestScrollableAncestor } from "$lib/util/scroll";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import type {
		ProfileListAction,
		ProfileListEntry,
		ProfileListScroll,
	} from "./profile-list";

	let {
		loadIds,
		scroll,
		actionLabel,
		countLabel,
		emptyMessage,
		successMessage,
		errorLabel,
		lift,
	}: {
		loadIds: () => Promise<number[]>;
		scroll: ProfileListScroll;
	} & ProfileListAction = $props();

	// Resolving profiles costs a request per 150 ids, and a long-standing account
	// can have hundreds on either list, so only a page is resolved at a time.
	const PAGE_SIZE = 60;

	let ids = $state<number[] | null>(null);
	let entries = $state<ProfileListEntry[]>([]);
	let loading = $state(true);
	let error = $state<unknown>(null);
	let loadingMore = $state(false);
	let lifting = $state<number | null>(null);
	let root = $state<HTMLElement | null>(null);

	const remaining = $derived((ids?.length ?? 0) - entries.length);
	const scroller = $derived(
		root ? (nearestScrollableAncestor(root) as HTMLElement | null) : null,
	);

	restoreScrollOnce(() => scroller, {
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		get scrollY() {
			return scroll.scrollY;
		},
	});

	beforeNavigate(() => {
		if (scroller) scroll.scrollY = scroller.scrollTop;
	});

	async function resolvePage(page: number[]): Promise<ProfileListEntry[]> {
		const resolved = new Map(
			(await getProfiles(page)).map((profile) => [
				profile.profileId,
				profile,
			]),
		);
		// Keep every id, resolved or not: an entry that can't be hydrated is the
		// one that most needs to be here, since its profile page is unreachable.
		return page.map((profileId) => ({
			profileId,
			profile: resolved.get(profileId) ?? null,
		}));
	}

	async function load() {
		loading = true;
		ids = null;
		entries = [];
		error = null;
		try {
			const loaded = await loadIds();
			// Both at once, once the first page is resolved: a list that counts
			// its ids before it has rows to show has no height to be restored
			// to, and scroll restoration would land back at the top.
			const first =
				loaded.length > 0
					? await resolvePage(loaded.slice(0, PAGE_SIZE))
					: [];
			ids = loaded;
			entries = first;
		} catch (caught) {
			console.error(caught);
			error = caught;
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		if (ids === null || loadingMore || remaining <= 0) return;
		loadingMore = true;
		try {
			const next = ids.slice(entries.length, entries.length + PAGE_SIZE);
			entries = [...entries, ...(await resolvePage(next))];
		} catch (caught) {
			console.error(caught);
			showErrorToast({ label: "Failed to load more", error: caught });
		} finally {
			loadingMore = false;
		}
	}

	async function act(profileId: number) {
		if (lifting !== null) return;
		const previousEntries = entries;
		const previousIds = ids;
		lifting = profileId;
		entries = previousEntries.filter(
			(entry) => entry.profileId !== profileId,
		);
		// Drop it from the id list too, or the count and paging would still
		// include someone the list no longer holds.
		ids = previousIds?.filter((id) => id !== profileId) ?? null;
		try {
			await lift({ profileId });
			toast.success(successMessage);
		} catch (caught) {
			console.error(caught);
			entries = previousEntries;
			ids = previousIds;
			showErrorToast({ label: errorLabel, error: caught });
		} finally {
			lifting = null;
		}
	}

	void load();
</script>

<div bind:this={root}>
	{#if error !== null}
		<ApiErrorDisplay {error} onRetry={() => void load()} class="my-2" />
	{:else if loading || ids === null}
		<div class="flex flex-col gap-2">
			{#each Array(3)}
				<Skeleton class="h-21 w-full rounded-xl" />
			{/each}
		</div>
	{:else if ids.length === 0}
		<span class="text-sm text-muted-foreground">{emptyMessage}</span>
	{:else}
		<div class="section-label pb-3">
			{ids.length}
			{countLabel}
		</div>
		<div class="flex flex-col">
			{#each entries as entry (entry.profileId)}
				{@const name = entry.profile?.displayName ?? null}
				<ProfileActionRow
					profileId={entry.profileId}
					{name}
					mediaHash={entry.profile?.profileImageMediaHash ?? null}
					{actionLabel}
					actionDescription="{actionLabel} {name ??
						`profile ${entry.profileId}`}"
					disabled={lifting !== null}
					onAction={() => void act(entry.profileId)}
				>
					{#snippet description()}
						{#if entry.profile === null}
							<span class="truncate text-2xs text-ink3">
								Profile {entry.profileId}
							</span>
						{/if}
					{/snippet}
				</ProfileActionRow>
			{/each}
		</div>
		{#if remaining > 0}
			<Button
				variant="outline"
				class="mt-3 w-full"
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
