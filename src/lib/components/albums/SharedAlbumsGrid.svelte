<script lang="ts">
	import LockSimpleIcon from "phosphor-svelte/lib/LockSimpleIcon";
	import UsersIcon from "phosphor-svelte/lib/UsersIcon";
	import { toast } from "svelte-sonner";

	import { getSharedAlbumsFeed } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
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

	// `/v3/pressie-albums/feed` has no companion endpoint for dismissing a share —
	// the only album deletion the API offers is the owner's — so the action is
	// offered but cannot do anything yet.
	function remove() {
		toast(ToastUnimplemented, {
			componentProps: {
				feature: "Removing a shared album",
				issue: 33,
			},
		});
	}

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
		<!-- Dashed rather than filled: it is the way into your own albums, not an
		     album, and a filled card in the first cell reads as one. -->
		<button
			type="button"
			class="relative flex aspect-album cursor-pointer flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border text-muted-foreground transition-colors can-hover:hover:bg-muted/40"
			onclick={onOpenMyAlbums}
		>
			<LockSimpleIcon class="size-5.5" />
			<span class="text-xs font-medium">My albums</span>
		</button>
	{/if}
{/snippet}

<div class="@container/photo-grid flex min-h-0 flex-1 flex-col">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay {error} onRetry={() => void load()} class="m-auto" />
		</div>
	{:else if albums === null}
		<div class="object-grid">
			{@render myAlbumsTile()}
			{#each Array(6)}
				<Skeleton class="aspect-album rounded-lg" />
			{/each}
		</div>
	{:else if albums.length === 0}
		{#if onOpenMyAlbums}
			<div class="object-grid">
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
		<div class="object-grid">
			{@render myAlbumsTile()}
			{#each albums as album (album.albumId)}
				<AlbumTile
					coverUrl={album.coverContent?.location ??
						album.coverContent?.coverContent}
					title={album.profile?.name || "Album"}
					subtitle={album.name || undefined}
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
					onRemove={remove}
				/>
			{/each}
		</div>
	{/if}
</div>
