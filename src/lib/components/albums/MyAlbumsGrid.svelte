<script lang="ts">
	import { goto } from "$app/navigation";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";

	import { ApiError } from "$lib/api";
	import { showErrorToast } from "$lib/api/error";
	import { createAlbum, getMyAlbums } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { MyAlbum } from "$lib/model/messaging/albums";
	import AlbumTile from "./AlbumTile.svelte";

	let albums = $state<MyAlbum[] | null>(null);
	let error = $state<unknown>(null);
	let creating = $state(false);

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

	void load();
</script>

{#snippet newAlbumTile()}
	<button
		type="button"
		class="flex aspect-3/4 cursor-pointer items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
		aria-label="New album"
		disabled={creating}
		onclick={() => void create()}
	>
		<PlusIcon weight="bold" class="size-8" />
	</button>
{/snippet}

<div class="@container/photo-grid flex min-h-0 flex-1 flex-col">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay {error} onRetry={() => void load()} class="m-auto" />
		</div>
	{:else if albums === null}
		<div class="photo-grid">
			{@render newAlbumTile()}
			{#each Array(5)}
				<Skeleton class="aspect-3/4 rounded-lg" />
			{/each}
		</div>
	{:else}
		<div class="photo-grid">
			{@render newAlbumTile()}
			{#each albums as album (album.albumId)}
				<AlbumTile
					coverUrl={album.content[0]?.thumbUrl || album.content[0]?.coverUrl}
					title={album.albumName || "Untitled album"}
					badge={album.sharedCount > 0 ? "Shared" : undefined}
					onclick={() => void goto(`/albums/${album.albumId}`)}
				/>
			{/each}
		</div>
	{/if}
</div>
