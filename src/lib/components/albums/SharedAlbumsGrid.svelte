<script lang="ts">
	import "photoswipe/style.css";
	import UsersIcon from "phosphor-svelte/lib/UsersIcon";

	import { getSharedAlbumsFeed } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { SharedAlbum } from "$lib/model/messaging/albums";
	import { AlbumOpener } from "./album-open.svelte";
	import AlbumTile from "./AlbumTile.svelte";

	let albums = $state<SharedAlbum[] | null>(null);
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

<div class="@container/photo-grid flex min-h-0 flex-1 flex-col">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay {error} onRetry={() => void load()} class="m-auto" />
		</div>
	{:else if albums === null}
		<div class="photo-grid">
			{#each Array(6)}
				<Skeleton class="aspect-3/4 rounded-lg" />
			{/each}
		</div>
	{:else if albums.length === 0}
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
			{#each albums as album (album.albumId)}
				<AlbumTile
					coverUrl={album.coverContent?.coverContent}
					title={album.name || "Album"}
					subtitle={album.profile?.name || undefined}
					unseen={album.hasUnseenContent}
					loading={opener.openingId === album.albumId}
					disabled={opener.openingId !== null || !album.albumViewable}
					onclick={() => void opener.open(album.albumId)}
				/>
			{/each}
		</div>
	{/if}
</div>
