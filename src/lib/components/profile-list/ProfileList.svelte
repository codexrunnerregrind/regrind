<script lang="ts">
	import { beforeNavigate } from "$app/navigation";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getProfiles } from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ProfileActionRow from "$lib/components/profile/ProfileActionRow.svelte";
	import ProfileActionRowSkeleton from "$lib/components/profile/ProfileActionRowSkeleton.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import { Button } from "$lib/components/ui/button";
	import { observeIntersection } from "$lib/util/observe-intersection";
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
	// A failed page stops the sentinel from firing again: it stays on screen
	// after the error, and retrying on sight would loop the failure.
	let moreError = $state(false);
	let lifting = $state<number | null>(null);
	let root = $state<HTMLElement | null>(null);

	const remaining = $derived((ids?.length ?? 0) - entries.length);
	const scroller = $derived(
		root ? (nearestScrollableAncestor(root) as HTMLElement | null) : null,
	);

	restoreScrollOnce({
		container: () => scroller,
		state: {
			get loading() {
				return loading;
			},
			get error() {
				return error;
			},
			get scrollY() {
				return scroll.scrollY;
			},
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
		if (ids === null || loadingMore || moreError || remaining <= 0) return;
		loadingMore = true;
		try {
			const next = ids.slice(entries.length, entries.length + PAGE_SIZE);
			entries = [...entries, ...(await resolvePage(next))];
			moreError = false;
		} catch (caught) {
			console.error(caught);
			moreError = true;
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
		<div class="flex flex-col">
			{#each Array(6)}
				<ProfileActionRowSkeleton />
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
			<!-- The next page resolves as the list is scrolled, the way it does
			     everywhere else; the skeletons stand in for the rows in flight
			     so the scroller keeps its height. -->
			{#if loadingMore}
				{#each Array(Math.min(remaining, 3))}
					<ProfileActionRowSkeleton />
				{/each}
			{/if}
		</div>
		{#if remaining > 0 && !loadingMore}
			{#if moreError}
				<Button
					variant="outline"
					class="mt-3 w-full"
					onclick={() => {
						moreError = false;
						void loadMore();
					}}
				>
					Try again
				</Button>
			{:else}
				<div
					class="h-0"
					use:observeIntersection={{
						handle: () => void loadMore(),
						rootMargin: "400px",
					}}
				></div>
			{/if}
		{/if}
	{/if}
	<ScrollToTopButton container={scroller} class="fixed bottom-nav-clear" />
</div>
