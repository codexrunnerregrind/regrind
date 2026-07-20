<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImageBrokenIcon from "phosphor-svelte/lib/ImageBrokenIcon";

	import { showErrorToast } from "$lib/api/error";
	import { getMyAlbums } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import SelectionCheck from "$lib/components/shared/SelectionCheck.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import type { MyAlbum } from "$lib/model/messaging/albums";
	import { getConversationState } from "../../conversation-state.svelte";

	let {
		onClose,
		onSelectionChange,
	}: {
		onClose: () => void;
		onSelectionChange: (count: number) => void;
	} = $props();

	const conversationState = $derived(getConversationState()());
	const selected = new SelectionSet<number>();

	function toggleSelected(id: number) {
		selected.toggle(id);
		onSelectionChange(selected.size);
	}

	let albums = $state<MyAlbum[] | null>(null);
	let error = $state<unknown>(null);

	async function load() {
		albums = null;
		error = null;
		try {
			const { albums: fetched } = await getMyAlbums();
			albums = fetched.filter((album) => album.isShareable);
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	void load();

	export function sendSelected() {
		if (albums === null) return;
		const ids = albums
			.filter((album) => selected.has(album.albumId))
			.map((album) => album.albumId);
		if (ids.length === 0) return;
		selected.clear();
		onSelectionChange(0);
		onClose();
		conversationState.shareAlbums(ids).catch((err: unknown) => {
			console.error(err);
			showErrorToast({
				label:
					ids.length > 1 ? "Failed to share albums" : "Failed to share album",
				error: err,
			});
		});
	}
</script>

<div class="@container/photo-grid flex flex-col rounded-grid">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay {error} onRetry={() => void load()} class="m-auto" />
		</div>
	{:else if albums === null}
		<div class="photo-grid">
			{#each Array(6)}
				<Skeleton class="aspect-3/4 rounded-none" />
			{/each}
		</div>
	{:else if albums.length === 0}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon">
					<FolderOpenIcon weight="fill" />
				</Empty.Media>
				<Empty.Title>No albums to share</Empty.Title>
				<Empty.Description>
					Albums you create appear here, ready to share.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="photo-grid">
			{#each albums as album (album.albumId)}
				{@const isSelected = selected.has(album.albumId)}
				{@const cover = album.content.thumbUrl || album.content.coverUrl}
				<button
					type="button"
					class="relative aspect-3/4"
					aria-label={isSelected ? "Deselect album" : "Select album"}
					aria-pressed={isSelected}
					onclick={() => toggleSelected(album.albumId)}
				>
					{#if cover}
						<img
							src={cover}
							alt=""
							class="size-full rounded-[inherit] bg-card-foreground/10 object-cover"
							draggable="false"
						/>
					{:else}
						<div
							class="flex size-full items-center justify-center rounded-[inherit] bg-card-foreground/20"
						>
							<ImageBrokenIcon
								weight="fill"
								class="size-8"
								color="var(--color-neutral-600)"
							/>
						</div>
					{/if}
					<div
						class="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-1 rounded-b-[inherit] bg-linear-to-t from-black/70 to-transparent p-2 pt-6 text-start"
					>
						<span class="line-clamp-2 text-xs font-medium text-white">
							{album.albumName || "Untitled album"}
						</span>
					</div>
					{#if isSelected}
						<div
							class="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-primary/50 outline-2 -outline-offset-2 outline-primary"
						>
							<SelectionCheck />
						</div>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
