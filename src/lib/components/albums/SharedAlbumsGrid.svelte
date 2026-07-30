<script lang="ts">
	import LockKeyIcon from "phosphor-svelte/lib/LockKeyIcon";
	import UsersIcon from "phosphor-svelte/lib/UsersIcon";

	import { getSharedAlbumsFeed } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { PressieSharedAlbum } from "$lib/model/messaging/albums";
	import { AlbumOpener } from "./album-open.svelte";
	import AlbumTile from "./AlbumTile.svelte";

	let {
		onOpenMyAlbums,
	}: {
		// When provided, a "My Albums" entry point is rendered as the first cell of
		// the grid (matching the official app's combined albums screen).
		onOpenMyAlbums?: () => void;
	} = $props();

	let albums = $state<PressieSharedAlbum[] | null>(null);
	let error = $state<unknown>(null);
	const opener = new AlbumOpener();

	async function load() {
		albums = null;
		error = null;
		try {
			const { sharedAlbums } = await getSharedAlbumsFeed();
			albums = sharedAlbums;
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	void load();
</script>

{#snippet myAlbumsTile()}
	{#if onOpenMyAlbums}
		<button
			type="button"
			class="relative flex aspect-3/4 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-muted/60 text-muted-foreground transition-colors hover:bg-muted/80"
			onclick={onOpenMyAlbums}
		>
			<LockKeyIcon weight="fill" class="size-8 text-foreground" />
			<span class="text-xs font-medium text-foreground">My Albums</span>
		</button>
	{/if}
{/snippet}

<div class="@container/photo-grid flex min-h-0 flex-1 flex-col">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay {error} onRetry={() => void load()} class="m-auto" />
		</div>
	{:else if albums === null}
		<div class="photo-grid">
			{@render myAlbumsTile()}
			{#each Array(6)}
				<Skeleton class="aspect-3/4 rounded-lg" />
			{/each}
		</div>
	{:else if albums.length === 0}
		{#if onOpenMyAlbums}
			<div class="photo-grid">
				{@render myAlbumsTile()}
			</div>
		{/if}
		<Empty.Root class="flex-1">
			<Empty.Header>
				<Empty.Media variant="icon">
					<UsersIcon weight="fill" />
				</Empty.Media>
				<Empty.Title>No shared albums</Empty.Title>
				<Empty.Description>
					Albums people share with you show up here.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="photo-grid">
			{@render myAlbumsTile()}
			{#each albums as album (album.albumId)}
				<AlbumTile
					coverUrl={album.coverContent?.location ??
						album.coverContent?.coverContent}
					title={album.name || "Album"}
					subtitle={album.profile?.name || undefined}
					unseen={album.hasUnseenContent}
					locked={!album.albumViewable}
					loading={opener.openingId === album.albumId}
					disabled={opener.openingId !== null}
					onclick={() =>
						void opener.open(album.albumId, {
							name: album.profile?.name,
							avatarUrl: album.profile?.profileUrl,
							distanceKm: album.profile?.distanceKm,
						})}
				/>
			{/each}
		</div>
	{/if}
</div>
