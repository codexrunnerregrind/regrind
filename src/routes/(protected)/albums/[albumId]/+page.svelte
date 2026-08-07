<script lang="ts">
	import { page } from "$app/state";
	import {
		ArrowLeftIcon,
		ImageIcon,
		PencilSimpleIcon,
		TrashIcon,
		UsersIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		type AlbumContentResponse,
		deleteAlbum,
		deleteAlbumContent,
		getAlbumContent,
		renameAlbum,
		reorderAlbumContent,
	} from "$lib/api/messaging/albums";
	import { loadAlbum, openAlbumLightbox } from "$lib/chat/album-viewer";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		ALBUM_NAME_MAX_BYTES,
		albumNameByteLength,
	} from "$lib/model/messaging/albums";
	import { hapticImpact } from "$lib/platform/haptics";
	import { dragReorder } from "$lib/util/drag-reorder";
	import AlbumShares from "./AlbumShares.svelte";

	let { data }: import("./$types").PageProps = $props();

	const albumId = $derived(Number(page.params.albumId));

	let album = $state<AlbumContentResponse | null>(null);
	let error = $state<unknown>(null);
	let busy = $state(false);
	let opening = $state(false);

	const isMine = $derived(
		album !== null && album.profileId === data.ourProfileId,
	);
	const cover = $derived(
		album?.content[0]?.coverUrl ?? album?.content[0]?.thumbUrl ?? null,
	);
	const updatedMs = $derived(
		album === null ? null : new Date(album.updatedAt).getTime(),
	);

	let renameOpen = $state(false);
	let renameValue = $state("");
	const renameTooLong = $derived(
		albumNameByteLength(renameValue) > ALBUM_NAME_MAX_BYTES,
	);

	let deleteAlbumOpen = $state(false);

	async function load(id: number) {
		album = null;
		error = null;
		if (!Number.isFinite(id)) {
			error = new Error("Invalid album");
			return;
		}
		try {
			album = await getAlbumContent(id);
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	$effect(() => {
		void load(albumId);
	});

	function openRename() {
		renameValue = album?.albumName ?? "";
		renameOpen = true;
	}

	async function submitRename() {
		if (album === null || renameTooLong || busy) return;
		const albumName = renameValue.trim() === "" ? null : renameValue;
		busy = true;
		try {
			await renameAlbum({ albumId, albumName });
			album.albumName = albumName;
			renameOpen = false;
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to rename album", error: err });
		} finally {
			busy = false;
		}
	}

	async function confirmDeleteAlbum() {
		if (busy) return;
		busy = true;
		try {
			await deleteAlbum({ albumId });
			deleteAlbumOpen = false;
			toast.success("Album deleted");
			history.back();
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to delete album", error: err });
		} finally {
			busy = false;
		}
	}

	async function view(index: number) {
		if (opening) return;
		opening = true;
		hapticImpact("light");
		try {
			const loaded = await loadAlbum(albumId);
			await openAlbumLightbox(loaded, {
				startIndex: index,
				// Someone else's album gets the reply chrome. This page knows no
				// profile to put in its header, so it falls back to the album name.
				sharer: isMine ? undefined : {},
			});
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to open album", error: err });
		} finally {
			opening = false;
		}
	}

	async function removeContent(contentId: number) {
		if (album === null || busy) return;
		const previous = album.content;
		busy = true;
		album.content = previous.filter((item) => item.contentId !== contentId);
		try {
			await deleteAlbumContent({ albumId, contentId });
		} catch (err) {
			console.error(err);
			if (album !== null) album.content = previous;
			showErrorToast({ label: "Failed to delete media", error: err });
		} finally {
			busy = false;
		}
	}

	async function moveContent(from: number, to: number) {
		if (album === null || busy) return;
		const previous = album.content;
		if (to < 0 || to >= previous.length || to === from) return;

		const next = [...previous];
		const [moved] = next.splice(from, 1);
		if (moved === undefined) return;
		next.splice(to, 0, moved);

		busy = true;
		album.content = next;
		try {
			// The API wants every id exactly once, so send the whole order.
			await reorderAlbumContent({
				albumId,
				contentIds: next.map((item) => item.contentId),
			});
		} catch (err) {
			console.error(err);
			if (album !== null) album.content = previous;
			showErrorToast({ label: "Failed to reorder media", error: err });
		} finally {
			busy = false;
		}
	}

	function scrollToShares() {
		document
			.getElementById("album-shares")
			?.scrollIntoView({ behavior: "smooth", block: "start" });
	}
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="fixed top-0 left-0 z-20 h-[calc(4.75rem+var(--safe-area-top))] w-full shrink-0"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex items-center h-full pe-5.5 pt-(--safe-area-top)"
	tag="nav"
>
	<button
		type="button"
		onclick={() => history.back()}
		class="flex h-full w-19 shrink-0 items-center justify-center"
		aria-label="Back"
	>
		<ArrowLeftIcon size={32} />
	</button>
	<span class="detail-title min-w-0 flex-1 truncate">
		{isMine ? "Edit album" : (album?.albumName ?? "Album")}
	</span>
</ProgressiveBlur>

<main class="screen-nav-host">
	<div class="h-full w-full overflow-y-auto overscroll-none">
		<div
			class="flex w-full px-4 pt-[calc(4.75rem+var(--safe-area-top))] pb-nav-clear"
		>
			<div
				class="@container/photo-grid m-auto flex w-full max-w-200 flex-col gap-5 pb-16"
			>
				{#if error !== null}
					<ApiErrorDisplay
						{error}
						onRetry={() => void load(albumId)}
						class="m-auto mt-8"
					/>
				{:else if album === null}
					<div class="flex gap-4">
						<Skeleton
							class="aspect-album h-32.5 shrink-0 rounded-lg"
						/>
						<div class="flex flex-1 flex-col gap-2 pt-1">
							<Skeleton class="h-5 w-32 rounded-md" />
							<Skeleton class="h-4 w-40 rounded-md" />
							<Skeleton class="h-9 w-36 rounded-full" />
						</div>
					</div>
					<div class="object-grid">
						{#each Array(6)}
							<Skeleton class="aspect-album-photo rounded-lg" />
						{/each}
					</div>
				{:else}
					<!-- Album summary: the cover beside what only you can see about the
					     album — its private name, its size, when you last touched it. -->
					<div class="flex gap-3.5">
						<button
							type="button"
							class={[
								"relative aspect-album h-32.5 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-media-placeholder",
								{ "opacity-50": opening },
							]}
							aria-label="Open album"
							disabled={opening || album.content.length === 0}
							onclick={() => void view(0)}
						>
							{#if cover}
								<img
									src={cover}
									alt=""
									class="size-full object-cover"
									draggable="false"
								/>
							{:else}
								<div
									class="flex size-full items-center justify-center text-media-placeholder-foreground"
								>
									<ImageIcon weight="fill" class="size-8" />
								</div>
							{/if}
						</button>
						<div class="flex min-w-0 flex-1 flex-col gap-2.25">
							<span class="section-label">Album name</span>
							<div class="flex items-center gap-2.25">
								<span class="album-name truncate">
									{album.albumName ?? "Untitled album"}
								</span>
								{#if isMine}
									<button
										type="button"
										class="shrink-0 text-primary"
										aria-label="Rename album"
										onclick={openRename}
									>
										<PencilSimpleIcon class="size-4" />
									</button>
								{/if}
							</div>
							{#if isMine}
								<span class="text-2xs/[1.4] text-ink3">
									Only you see the album name
								</span>
							{/if}
							<span class="text-preview text-muted-foreground">
								{album.content.length}
								{album.content.length === 1 ? "item" : "items"}
								{#if updatedMs !== null}
									&middot; updated <RelativeTimeDynamic
										date={updatedMs}
									/>
								{/if}
							</span>
							{#if isMine}
								<Button
									variant="secondary"
									size="sm"
									class="mt-0.5 w-fit gap-2 rounded-full"
									onclick={scrollToShares}
								>
									<UsersIcon weight="fill" class="size-4" />
									Shared with ({album.sharedCount})
								</Button>
							{/if}
						</div>
					</div>

					<!-- Content grid -->
					<div class="flex flex-col gap-2.5">
						<div class="flex items-center justify-between gap-2">
							<span class="section-label">Photos</span>
							{#if isMine && album.content.length > 1}
								<span class="text-2xs text-ink3"
									>Hold a photo to reorder</span
								>
							{/if}
						</div>
						{#if album.content.length > 0}
							<div
								class="object-grid reorder-grid"
								use:dragReorder={{
									enabled: isMine && !busy,
									onReorder: (from, to) =>
										void moveContent(from, to),
								}}
							>
								{#each album.content as item, index (item.contentId)}
									<div
										class="relative aspect-album-photo"
										data-reorder-item
									>
										<button
											type="button"
											class="size-full overflow-hidden rounded-lg"
											aria-label="View media"
											disabled={opening}
											onclick={() => void view(index)}
										>
											<img
												src={item.thumbUrl}
												alt=""
												class="size-full bg-media-placeholder object-cover"
												draggable="false"
											/>
										</button>
										{#if isMine}
											<button
												type="button"
												class="absolute top-1.5 right-1.5 flex size-6.5 items-center justify-center rounded-full bg-plate-strong text-plate-foreground disabled:opacity-50"
												aria-label="Delete media"
												disabled={busy}
												onclick={() =>
													void removeContent(
														item.contentId,
													)}
											>
												<TrashIcon class="size-3.5" />
											</button>
											<!-- The first photo is the album's cover everywhere else,
											     so the grid says which one that is. Fill only, no
											     backdrop blur — see AlbumTile.svelte. -->
											{#if index === 0}
												<span
													class="pointer-events-none absolute bottom-1.5 left-1.5 rounded-plate bg-plate-strong px-1.75 py-0.75 text-3xs font-semibold text-plate-foreground"
												>
													Cover
												</span>
											{/if}
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<div
								class="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground"
							>
								This album has no media yet.
							</div>
						{/if}
					</div>

					{#if isMine}
						<div id="album-shares" class="scroll-mt-20">
							<AlbumShares
								{albumId}
								onSharedCountChange={(count) => {
									if (album !== null)
										album.sharedCount = count;
								}}
							/>
						</div>

						<Button
							variant="ghost"
							class="mt-2 w-full text-destructive hover:text-destructive"
							onclick={() => (deleteAlbumOpen = true)}
						>
							<TrashIcon class="size-5" />
							Delete album
						</Button>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</main>

<Dialog.Root bind:open={renameOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Rename album</Dialog.Title>
		</Dialog.Header>
		<Input bind:value={renameValue} placeholder="Album name" />
		{#if renameTooLong}
			<p class="text-sm text-destructive">
				Name is too long ({albumNameByteLength(
					renameValue,
				)}/{ALBUM_NAME_MAX_BYTES}
				bytes).
			</p>
		{/if}
		<Dialog.Footer>
			<Button
				variant="outline"
				onclick={() => (renameOpen = false)}
				disabled={busy}
			>
				Cancel
			</Button>
			<Button
				onclick={() => void submitRename()}
				disabled={busy || renameTooLong}
			>
				Save
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={deleteAlbumOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this album?</AlertDialog.Title>
			<AlertDialog.Description>
				The album and everyone's access to it will be removed. This
				cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={busy}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				disabled={busy}
				onclick={() => void confirmDeleteAlbum()}
			>
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
