<script lang="ts">
	import { page } from "$app/state";
	import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";
	import DownloadSimpleIcon from "phosphor-svelte/lib/DownloadSimpleIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import PencilSimpleIcon from "phosphor-svelte/lib/PencilSimpleIcon";
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import UsersIcon from "phosphor-svelte/lib/UsersIcon";
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
	import { getAlbumGridColumnsSnapshot } from "$lib/app-data/preferences.svelte";
	import {
		AlbumLockedError,
		openAlbumLightbox,
		resolveAlbumForViewing,
	} from "$lib/chat/album-viewer";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import PhotoEditorDrawer from "$lib/components/media/PhotoEditorDrawer.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		ALBUM_NAME_MAX_BYTES,
		albumNameByteLength,
	} from "$lib/model/messaging/albums";
	import { hapticImpact } from "$lib/platform/haptics";
	import { AlbumMediaAdder } from "./album-add-media.svelte";
	import { AlbumLimits } from "./album-limits.svelte";
	import { AlbumProcessingPoll } from "./album-processing.svelte";
	import { saveAlbumMedia } from "./album-save-all";
	import AlbumContentGrid from "./AlbumContentGrid.svelte";
	import AlbumDeleteDialog from "./AlbumDeleteDialog.svelte";
	import AlbumRenameDialog from "./AlbumRenameDialog.svelte";
	import AlbumShares from "./AlbumShares.svelte";

	let { data }: import("./$types").PageProps = $props();

	const albumId = $derived(Number(page.params.albumId));

	let album = $state<AlbumContentResponse | null>(null);
	let error = $state<unknown>(null);
	let busy = $state(false);
	let opening = $state(false);

	/** The API is still transcoding this item, so nothing it points at works. */
	function isProcessing(item: AlbumContentResponse["content"][number]) {
		return item.processing === true;
	}

	const isMine = $derived(
		album !== null && album.profileId === data.ourProfileId,
	);

	const limits = new AlbumLimits();
	$effect(() => {
		if (isMine) void limits.read();
	});
	const remaining = $derived(
		album === null ? null : limits.remaining(album.content),
	);
	const first = $derived(album?.content[0] ?? null);
	// A processing item has no usable URL yet, so the summary shows the album's
	// placeholder rather than a broken image.
	const cover = $derived(
		first === null || isProcessing(first)
			? null
			: (first.coverUrl ?? first.thumbUrl),
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

	let savingAll = $state(false);

	const media = new AlbumMediaAdder({
		id: () => albumId,
		profileId: () => data.ourProfileId,
		content: () => album?.content ?? [],
		busy: () => busy,
		reload: () => refresh(albumId),
	});

	const processingPoll = new AlbumProcessingPoll();

	async function load(id: number) {
		album = null;
		error = null;
		processingPoll.reset();
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

	/** A re-read that leaves the screen up, for a poll or an add. */
	async function refresh(id: number) {
		try {
			album = await getAlbumContent(id);
		} catch (err) {
			console.error(err);
		}
	}

	$effect(() => {
		void load(albumId);
	});

	$effect(() =>
		processingPoll.schedule({
			processing: album?.content.some(isProcessing) === true,
			refresh: () => void refresh(albumId),
		}),
	);

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
		const item = album?.content[index];
		if (item !== undefined && isProcessing(item)) {
			toast.info("Still processing — it will play once it is ready.");
			return;
		}
		opening = true;
		hapticImpact("light");
		try {
			// Our own album is already in hand — the grid below is drawn from it —
			// and nothing can revoke our access to it between the two, so the tap
			// opens it without a round trip. Somebody else's is re-resolved: a
			// view-once album can expire between this page loading and the tap, and
			// the paywall teaser still carries previews in that case — the same
			// fallback the album grids use.
			const { album: loaded, fromPaywall } =
				isMine && album !== null && album.content.length > 0
					? { album, fromPaywall: false }
					: await resolveAlbumForViewing({
							albumId,
							ownerProfileId: album?.profileId,
							ours: isMine,
						});
			await openAlbumLightbox(loaded, {
				// A teaser lost the original ordering, so it always opens at the top.
				startIndex: fromPaywall ? 0 : index,
				// Someone else's album gets the sender chrome. This page knows no
				// profile to put in its header, so it falls back to the album name.
				sharer: isMine ? undefined : {},
				fromPaywall,
			});
		} catch (err) {
			if (err instanceof AlbumLockedError) {
				toast.info(err.message);
			} else {
				console.error(err);
				showErrorToast({ label: "Failed to open album", error: err });
			}
		} finally {
			opening = false;
		}
	}

	async function saveAll() {
		if (album === null || savingAll || album.content.length === 0) return;
		savingAll = true;
		try {
			await saveAlbumMedia(album.content, album.profileId);
		} finally {
			savingAll = false;
		}
	}

	async function removeContent(contentId: number) {
		if (album === null || busy) return;
		const previous = album.content;
		const item = previous.find((one) => one.contentId === contentId);
		busy = true;
		album.content = previous.filter((one) => one.contentId !== contentId);
		try {
			await deleteAlbumContent({ albumId, contentId });
		} catch (err) {
			console.error(err);
			if (album !== null) album.content = previous;
			// The API has refused to delete an item it was still transcoding,
			// with the same bare 400 it refuses everything else with. It is
			// asked anyway — a guess about why is not worth losing the only way
			// to be rid of an item — but the refusal is worth explaining.
			showErrorToast({
				label:
					item !== undefined && isProcessing(item)
						? "Couldn't delete it — still processing on Grindr's side."
						: "Failed to delete media",
				error: err,
			});
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
			// Ordering is refused outright while any item is being transcoded,
			// so the item being moved is not necessarily the one at fault.
			showErrorToast({
				label: previous.some(isProcessing)
					? "Couldn't reorder — an item is still processing on Grindr's side."
					: "Failed to reorder media",
				error: err,
			});
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
					<div
						class="object-grid"
						data-grid-columns={getAlbumGridColumnsSnapshot()}
					>
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
							{#if isMine && remaining !== null}
								<span class="text-2xs/[1.4] text-ink3">
									{remaining.items} left, of which {remaining.videos}
									{remaining.videos === 1
										? "video"
										: "videos"}
								</span>
							{/if}
							<!-- Wraps: the column beside the cover is narrow on a phone. -->
							<div
								class="mt-0.5 flex flex-wrap items-center gap-2"
							>
								{#if isMine}
									<Button
										variant="secondary"
										size="sm"
										class="w-fit gap-2 rounded-full"
										onclick={scrollToShares}
									>
										<UsersIcon
											weight="fill"
											class="size-4"
										/>
										Shared with ({album.sharedCount})
									</Button>
								{/if}
								{#if album.content.length > 0}
									<Button
										variant="secondary"
										size="sm"
										class="w-fit gap-2 rounded-full"
										disabled={savingAll}
										onclick={() => void saveAll()}
									>
										<DownloadSimpleIcon class="size-4" />
										{savingAll ? "Saving…" : "Save all"}
									</Button>
								{/if}
							</div>
						</div>
					</div>

					<AlbumContentGrid
						{albumId}
						content={album.content}
						{isMine}
						{busy}
						adding={media.adding}
						{opening}
						onView={(index) => void view(index)}
						onRemove={(contentId) => void removeContent(contentId)}
						onReorder={(from, to) => void moveContent(from, to)}
						onAdd={() => void media.add()}
					/>

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

<AlbumRenameDialog
	bind:open={renameOpen}
	bind:value={renameValue}
	{busy}
	onSubmit={() => void submitRename()}
/>

<AlbumDeleteDialog
	bind:open={deleteAlbumOpen}
	{busy}
	onConfirm={() => void confirmDeleteAlbum()}
/>

<PhotoEditorDrawer
	queue={media.edits}
	title="Add to album"
	confirmLabel="Add to album"
	busy={media.adding}
/>
