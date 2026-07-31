<script lang="ts">
	import { page } from "$app/state";
	import {
		ArrowLeftIcon,
		CaretLeftIcon,
		CaretRightIcon,
		ImageIcon,
		PencilSimpleIcon,
		TrashIcon,
		UsersIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
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

	async function moveContent(index: number, delta: number) {
		if (album === null || busy) return;
		const target = index + delta;
		const previous = album.content;
		if (target < 0 || target >= previous.length) return;

		const next = [...previous];
		const [moved] = next.splice(index, 1);
		if (moved === undefined) return;
		next.splice(target, 0, moved);

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
	<span class="min-w-0 flex-1 truncate text-lg font-medium">
		{isMine ? "Edit Album" : (album?.albumName ?? "Album")}
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
						<Skeleton class="aspect-3/4 w-28 shrink-0 rounded-xl" />
						<div class="flex flex-1 flex-col gap-2 pt-1">
							<Skeleton class="h-5 w-32 rounded-md" />
							<Skeleton class="h-4 w-40 rounded-md" />
							<Skeleton class="h-9 w-36 rounded-full" />
						</div>
					</div>
					<div class="photo-grid">
						{#each Array(6)}
							<Skeleton class="aspect-square rounded-lg" />
						{/each}
					</div>
				{:else}
					<!-- Album summary -->
					<div class="flex gap-4">
						<button
							type="button"
							class={[
								"relative aspect-3/4 w-28 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-card-foreground/10",
								opening && "opacity-50",
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
									class="flex size-full items-center justify-center text-muted-foreground"
								>
									<ImageIcon weight="fill" class="size-8" />
								</div>
							{/if}
						</button>
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<span
								class="text-xs tracking-wide text-muted-foreground uppercase"
							>
								Album name
							</span>
							<div class="flex items-center gap-2">
								<span class="truncate text-xl font-semibold">
									{album.albumName ?? "Untitled album"}
								</span>
								{#if isMine}
									<button
										type="button"
										class="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
										aria-label="Rename album"
										onclick={openRename}
									>
										<PencilSimpleIcon class="size-5" />
									</button>
								{/if}
							</div>
							{#if isMine}
								<span class="text-xs text-muted-foreground">
									Only you see the album name
								</span>
							{/if}
							<span class="mt-1 text-sm text-muted-foreground">
								{album.content.length}
								{album.content.length === 1 ? "item" : "items"}
								{#if updatedMs !== null}
									&middot; updated <RelativeTimeDynamic date={updatedMs} />
								{/if}
							</span>
							{#if isMine}
								<Button
									variant="secondary"
									size="sm"
									class="mt-2 w-fit gap-2 rounded-full"
									onclick={scrollToShares}
								>
									<UsersIcon weight="fill" class="size-4" />
									Shared with ({album.sharedCount})
								</Button>
							{/if}
						</div>
					</div>

					<!-- Content grid -->
					<div class="flex flex-col gap-2">
						{#if album.content.length > 0}
							<div class="photo-grid">
								{#each album.content as item, index (item.contentId)}
									<div class="relative aspect-square">
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
												class="size-full bg-card-foreground/10 object-cover"
												draggable="false"
											/>
										</button>
										{#if isMine}
											<button
												type="button"
												class="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-50"
												aria-label="Delete media"
												disabled={busy}
												onclick={() => void removeContent(item.contentId)}
											>
												<TrashIcon class="size-4" />
											</button>
											<div
												class="absolute inset-x-1.5 bottom-1.5 flex justify-between"
											>
												<button
													type="button"
													class="flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-30"
													aria-label="Move earlier"
													disabled={busy || index === 0}
													onclick={() => void moveContent(index, -1)}
												>
													<CaretLeftIcon class="size-4" />
												</button>
												<button
													type="button"
													class="flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-30"
													aria-label="Move later"
													disabled={busy || index === album.content.length - 1}
													onclick={() => void moveContent(index, 1)}
												>
													<CaretRightIcon class="size-4" />
												</button>
											</div>
										{/if}
									</div>
								{/each}
							</div>
							<span class="text-center text-xs text-muted-foreground">
								{#if isMine}
									Tap to view &middot; use the arrows to reorder
								{:else}
									Tap to view
								{/if}
							</span>
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
									if (album !== null) album.sharedCount = count;
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
				The album and everyone's access to it will be removed. This cannot be
				undone.
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
