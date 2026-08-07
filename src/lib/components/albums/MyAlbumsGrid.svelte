<script lang="ts">
	import { goto } from "$app/navigation";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import { toast } from "svelte-sonner";

	import { ApiError } from "$lib/api/api-error";
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		createAlbum,
		deleteAlbum,
		getMyAlbums,
	} from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { MyAlbum } from "$lib/model/messaging/albums";
	import AlbumTile from "./AlbumTile.svelte";

	let albums = $state<MyAlbum[] | null>(null);
	let error = $state<unknown>(null);
	let creating = $state(false);
	let pendingDelete = $state<MyAlbum | null>(null);
	let deleting = $state(false);

	async function load() {
		albums = null;
		error = null;
		try {
			albums = await getMyAlbums();
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	async function create() {
		if (creating) return;
		creating = true;
		try {
			const { albumId } = await createAlbum({ albumName: null });
			await goto(`/albums/${albumId}`);
		} catch (err) {
			console.error(err);
			const status = err instanceof ApiError ? err.response?.status : null;
			showErrorToast({
				label:
					status === 402
						? "You've reached your album limit"
						: "Failed to create album",
				error: err,
			});
		} finally {
			creating = false;
		}
	}

	async function confirmDelete(album: MyAlbum) {
		if (deleting) return;
		const previous = albums;
		deleting = true;
		albums = previous?.filter((it) => it.albumId !== album.albumId) ?? null;
		try {
			await deleteAlbum({ albumId: album.albumId });
			pendingDelete = null;
			toast.success("Album deleted");
		} catch (err) {
			console.error(err);
			albums = previous;
			showErrorToast({ label: "Failed to delete album", error: err });
		} finally {
			deleting = false;
		}
	}

	void load();
</script>

{#snippet newAlbumTile()}
	<button
		type="button"
		class="flex aspect-album cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-primary transition-colors disabled:opacity-50 can-hover:hover:bg-muted/40"
		aria-label="New album"
		disabled={creating}
		onclick={() => void create()}
	>
		<PlusIcon class="size-4.5" />
		<span class="text-2xs font-medium">Add</span>
	</button>
{/snippet}

<div class="@container/photo-grid flex min-h-0 flex-1 flex-col">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay {error} onRetry={() => void load()} class="m-auto" />
		</div>
	{:else if albums === null}
		<div class="object-grid">
			{@render newAlbumTile()}
			{#each Array(5)}
				<Skeleton class="aspect-album rounded-lg" />
			{/each}
		</div>
	{:else}
		<div class="object-grid">
			{@render newAlbumTile()}
			{#each albums as album (album.albumId)}
				<AlbumTile
					coverUrl={album.content[0]?.thumbUrl || album.content[0]?.coverUrl}
					title={album.albumName || "Untitled album"}
					badge={album.sharedCount > 0 ? "Shared" : undefined}
					onclick={() => void goto(`/albums/${album.albumId}`)}
					onRemove={() => (pendingDelete = album)}
					removeLabel="Delete Album"
				/>
			{/each}
		</div>
	{/if}
</div>

<AlertDialog.Root
	open={pendingDelete !== null}
	onOpenChange={(open) => {
		if (!open) pendingDelete = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this album?</AlertDialog.Title>
			<AlertDialog.Description>
				The album and everyone's access to it will be removed. This cannot be
				undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={deleting}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				disabled={deleting}
				onclick={() => {
					// Read before the dialog closes and clears it.
					const album = pendingDelete;
					if (album !== null) void confirmDelete(album);
				}}
			>
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
