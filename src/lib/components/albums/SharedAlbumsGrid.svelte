<script lang="ts">
	import LockSimpleIcon from "phosphor-svelte/lib/LockSimpleIcon";
	import UsersIcon from "phosphor-svelte/lib/UsersIcon";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getAlbumGridColumnsSnapshot } from "$lib/app-data/preferences.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { PressieSharedAlbum } from "$lib/model/messaging/albums";
	import { AlbumOpener } from "./album-open.svelte";
	import AlbumTile from "./AlbumTile.svelte";
	import { sharedAlbums } from "./shared-albums-state.svelte";

	let {
		onOpenMyAlbums,
	}: {
		// When provided, a "My Albums" entry point is rendered as the first cell of
		// the grid (matching the official app's combined albums screen).
		onOpenMyAlbums?: () => void;
	} = $props();

	const albums = $derived(sharedAlbums.albums);
	const error = $derived(sharedAlbums.error);
	const opener = new AlbumOpener();

	let pendingRemove = $state<PressieSharedAlbum | null>(null);
	let removing = $state(false);

	// Giving up access, not deleting anything: the album stays where it is, and
	// the owner can share it again.
	async function confirmRemove(album: PressieSharedAlbum) {
		if (removing) return;
		removing = true;
		try {
			await sharedAlbums.remove(album.albumId);
			pendingRemove = null;
			toast.success("Album removed");
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to remove album", error });
		} finally {
			removing = false;
		}
	}

	// After mount, so a revalidate never writes state mid-render.
	onMount(() => sharedAlbums.ensureLoaded());
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

<div class="@container/photo-grid flex flex-1 flex-col">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay
				{error}
				onRetry={() => void sharedAlbums.refresh()}
				class="m-auto"
			/>
		</div>
	{:else if albums === null}
		<div
			class="object-grid gap-1"
			data-grid-columns={getAlbumGridColumnsSnapshot()}
		>
			{@render myAlbumsTile()}
			{#each Array(6)}
				<Skeleton class="aspect-album rounded-lg" />
			{/each}
		</div>
	{:else if albums.length === 0}
		{#if onOpenMyAlbums}
			<div
				class="object-grid gap-1"
				data-grid-columns={getAlbumGridColumnsSnapshot()}
			>
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
		<div
			class="object-grid gap-1"
			data-grid-columns={getAlbumGridColumnsSnapshot()}
		>
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
					onclick={() => {
						// The feed is cached now, so the dot has to be settled here —
						// there is no remount refetch to pick the server's word up.
						if (album.albumViewable)
							sharedAlbums.markSeen(album.albumId);
						void opener.open(
							album.albumId,
							{
								name: album.profile?.name,
								avatarUrl: album.profile?.profileUrl,
								distanceKm: album.profile?.distanceKm,
							},
							{
								ownerProfileId:
									album.ownerProfileId ??
									album.profile?.profileId,
								albumName: album.name,
							},
						);
					}}
					onRemove={() => (pendingRemove = album)}
				/>
			{/each}
		</div>
	{/if}
</div>

<AlertDialog.Root
	open={pendingRemove !== null}
	onOpenChange={(open) => {
		if (!open && !removing) pendingRemove = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Remove this album?</AlertDialog.Title>
			<AlertDialog.Description>
				It leaves your shared albums and you lose access to it. The
				owner can share it with you again.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={removing}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				disabled={removing}
				onclick={() => {
					const album = pendingRemove;
					if (album !== null) void confirmRemove(album);
				}}
			>
				Remove
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
