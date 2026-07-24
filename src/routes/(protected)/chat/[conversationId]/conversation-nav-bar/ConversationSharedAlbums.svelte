<script lang="ts">
	import "photoswipe/style.css";
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";
	import LockKeyIcon from "phosphor-svelte/lib/LockKeyIcon";

	import { getSharedAlbumsFeed } from "$lib/api/messaging/albums";
	import { AlbumOpener } from "$lib/components/albums/album-open.svelte";
	import AlbumTile from "$lib/components/albums/AlbumTile.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import * as Sheet from "$lib/components/ui/sheet";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { PressieSharedAlbum } from "$lib/model/messaging/albums";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
	import { hapticSelection } from "$lib/platform/haptics";

	let {
		profileId,
		name,
	}: {
		profileId: number;
		name?: string | null;
	} = $props();

	let open = $state(false);
	let albums = $state<PressieSharedAlbum[] | null>(null);
	let error = $state<unknown>(null);
	const opener = new AlbumOpener();

	async function load() {
		albums = null;
		error = null;
		try {
			const { sharedAlbums } = await getSharedAlbumsFeed();
			// Only the albums this conversation partner has shared with us.
			albums = sharedAlbums.filter(
				(album) =>
					album.profile?.profileId === profileId ||
					album.ownerProfileId === profileId,
			);
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	function openSheet() {
		hapticSelection();
		open = true;
		void load();
	}

	$effect(() => {
		if (open) {
			const onBackGesture = () => {
				open = false;
				return false;
			};
			backGestureEventHandlers.add(onBackGesture);
			return () => {
				backGestureEventHandlers.delete(onBackGesture);
			};
		}
	});
</script>

<button
	type="button"
	aria-label="Albums shared with me"
	class="flex h-full w-14 shrink-0 items-center justify-center text-foreground"
	onclick={openSheet}
>
	<ImagesIcon size={26} />
</button>

<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		class="mb-(--safe-area-bottom) max-h-screen-safe gap-0"
	>
		<Sheet.Header class="p-4 pb-2">
			<Sheet.Title>
				{name ? `Albums from ${name}` : "Shared albums"}
			</Sheet.Title>
			<Sheet.Description>
				Albums this person has shared with you.
			</Sheet.Description>
		</Sheet.Header>
		<div class="@container/photo-grid min-h-0 overflow-auto px-4 pt-1 pb-6">
			{#if error !== null}
				<div class="flex justify-center py-8">
					<ApiErrorDisplay {error} onRetry={() => void load()} />
				</div>
			{:else if albums === null}
				<div class="photo-grid">
					{#each Array(2)}
						<Skeleton class="aspect-3/4 rounded-lg" />
					{/each}
				</div>
			{:else if albums.length === 0}
				<Empty.Root class="py-8">
					<Empty.Header>
						<Empty.Media variant="icon">
							<LockKeyIcon weight="fill" />
						</Empty.Media>
						<Empty.Title>No shared albums</Empty.Title>
						<Empty.Description>
							Albums this person shares with you show up here.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<div class="photo-grid">
					{#each albums as album (album.albumId)}
						<AlbumTile
							coverUrl={album.coverContent?.location ??
								album.coverContent?.coverContent}
							title={album.name || "Album"}
							unseen={album.hasUnseenContent}
							locked={!album.albumViewable}
							loading={opener.openingId === album.albumId}
							disabled={opener.openingId !== null}
							onclick={async () => {
								// Close the sheet once the viewer is open: as a modal it puts
								// `pointer-events: none` on the body, which the toolbar buttons
								// override but the swipe surface inherits — blocking swiping
								// between the album's photos.
								await opener.open(album.albumId);
								open = false;
							}}
						/>
					{/each}
				</div>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
