<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";

	import {
		getAlbumsSharedByProfile,
		getMyAlbums,
	} from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { MyAlbum, SharedAlbum } from "$lib/model/messaging/albums";

	let {
		profileId,
		self,
	}: {
		profileId: number;
		self: boolean;
	} = $props();

	/** Both album shapes reduced to what this list renders. */
	type AlbumEntry = {
		albumId: number;
		albumName: string | null;
		coverUrl: string | null;
		itemCount: number | null;
		hasUnseenContent: boolean;
	};

	function fromMyAlbum(album: MyAlbum): AlbumEntry {
		const first = album.content[0];
		return {
			albumId: album.albumId,
			albumName: album.albumName,
			coverUrl: first?.coverUrl ?? first?.thumbUrl ?? null,
			itemCount: album.content.length,
			// Only shared albums carry this — nothing is ever unseen in your own.
			hasUnseenContent: false,
		};
	}

	function fromSharedAlbum(album: SharedAlbum): AlbumEntry {
		const counts = album.contentCount;
		return {
			albumId: album.albumId,
			albumName: album.albumName,
			coverUrl: album.content?.coverUrl ?? null,
			itemCount: counts ? counts.imageCount + counts.videoCount : null,
			hasUnseenContent: album.hasUnseenContent,
		};
	}

	let albums = $state<AlbumEntry[] | null>(null);
	let error = $state<unknown>(null);

	async function load(id: number, isSelf: boolean) {
		albums = null;
		error = null;
		try {
			albums = isSelf
				? (await getMyAlbums()).map(fromMyAlbum)
				: (await getAlbumsSharedByProfile(id)).map(fromSharedAlbum);
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	$effect(() => {
		void load(profileId, self);
	});
</script>

{#if error !== null || albums === null || albums.length > 0}
	<div class="mt-4 flex flex-col gap-2">
		<span class="text-sm text-muted-foreground uppercase">Albums</span>
		{#if error !== null}
			<ApiErrorDisplay
				{error}
				onRetry={() => void load(profileId, self)}
				class="my-2"
			/>
		{:else if albums === null}
			<div class="flex gap-2">
				{#each Array(3)}
					<Skeleton class="aspect-square w-24 rounded-xl" />
				{/each}
			</div>
		{:else}
			<div class="flex gap-2 overflow-x-auto pb-1">
				{#each albums as album (album.albumId)}
					<a
						href="/albums/{album.albumId}"
						class="flex w-24 shrink-0 flex-col gap-1"
					>
						<div class="relative aspect-square">
							{#if album.coverUrl}
								<img
									src={album.coverUrl}
									alt=""
									class="size-full rounded-xl bg-card-foreground/10 object-cover"
									draggable="false"
								/>
							{:else}
								<div
									class="flex size-full items-center justify-center rounded-xl bg-card-foreground/10 text-muted-foreground"
								>
									<FolderOpenIcon weight="fill" class="size-6" />
								</div>
							{/if}
							{#if album.hasUnseenContent}
								<span
									class="absolute end-1 top-1 size-2.5 rounded-full bg-primary outline-2 outline-background"
									aria-label="Unseen content"
								></span>
							{/if}
						</div>
						<span class="truncate text-sm">
							{album.albumName ?? "Untitled album"}
						</span>
						{#if album.itemCount !== null}
							<span class="text-xs text-muted-foreground">
								{album.itemCount}
								{album.itemCount === 1 ? "item" : "items"}
							</span>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}
