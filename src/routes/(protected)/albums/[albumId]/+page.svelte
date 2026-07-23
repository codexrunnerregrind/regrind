<script lang="ts">
	import { page } from "$app/state";
	import {
		ArrowLeftIcon,
		CaretLeftIcon,
		CaretRightIcon,
		PencilSimpleIcon,
		TrashIcon,
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
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		ALBUM_NAME_MAX_BYTES,
		albumNameByteLength,
	} from "$lib/model/messaging/albums";
	import AlbumShares from "./AlbumShares.svelte";

	let { data }: import("./$types").PageProps = $props();

	const albumId = $derived(Number(page.params.albumId));

	let album = $state<AlbumContentResponse | null>(null);
	let error = $state<unknown>(null);
	let busy = $state(false);

	const isMine = $derived(
		album !== null && album.profileId === data.ourProfileId,
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
	<span class="min-w-0 flex-1 truncate">
		{album?.albumName ?? "Album"}
	</span>
	{#if isMine}
		<div class="flex shrink-0 items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				aria-label="Rename album"
				onclick={() => {
					renameValue = album?.albumName ?? "";
					renameOpen = true;
				}}
			>
				<PencilSimpleIcon class="size-5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				aria-label="Delete album"
				onclick={() => (deleteAlbumOpen = true)}
			>
				<TrashIcon class="size-5" />
			</Button>
		</div>
	{/if}
</ProgressiveBlur>

<main class="screen-nav-host">
	<div class="h-full w-full overflow-y-auto overscroll-none">
		<div class="flex w-full px-4 pt-19 pb-nav-clear">
			<div
				class="@container/photo-grid m-auto flex w-full max-w-200 flex-col gap-3 pb-16"
			>
				{#if error !== null}
					<ApiErrorDisplay
						{error}
						onRetry={() => void load(albumId)}
						class="m-auto mt-8"
					/>
				{:else if album === null}
					<div class="photo-grid">
						{#each Array(6)}
							<Skeleton class="aspect-square rounded-none" />
						{/each}
					</div>
				{:else}
					<div class="photo-grid">
						{#each album.content as item, index (item.contentId)}
							<div class="relative aspect-square">
								<img
									src={item.thumbUrl}
									alt=""
									class="size-full bg-card-foreground/10 object-cover"
									draggable="false"
								/>
								{#if isMine}
									<div class="absolute inset-x-0 top-0 flex justify-end p-1">
										<Button
											variant="secondary"
											size="icon"
											class="size-7 bg-black/60 text-white hover:bg-black/80"
											aria-label="Delete media"
											disabled={busy}
											onclick={() => void removeContent(item.contentId)}
										>
											<TrashIcon class="size-4" />
										</Button>
									</div>
									<div
										class="absolute inset-x-0 bottom-0 flex justify-between p-1"
									>
										<Button
											variant="secondary"
											size="icon"
											class="size-7 bg-black/60 text-white hover:bg-black/80"
											aria-label="Move earlier"
											disabled={busy || index === 0}
											onclick={() => void moveContent(index, -1)}
										>
											<CaretLeftIcon class="size-4" />
										</Button>
										<Button
											variant="secondary"
											size="icon"
											class="size-7 bg-black/60 text-white hover:bg-black/80"
											aria-label="Move later"
											disabled={busy || index === album.content.length - 1}
											onclick={() => void moveContent(index, 1)}
										>
											<CaretRightIcon class="size-4" />
										</Button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
				{#if isMine && album !== null}
					<AlbumShares {albumId} />
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
