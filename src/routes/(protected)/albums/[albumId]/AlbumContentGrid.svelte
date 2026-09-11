<script lang="ts">
	import {
		PlayIcon,
		PlusIcon,
		SpinnerGapIcon,
		TrashIcon,
	} from "phosphor-svelte";

	import {
		type AlbumContentResponse,
		getAlbumMediaPoster,
	} from "$lib/api/messaging/albums";
	import { getAlbumGridColumnsSnapshot } from "$lib/app-data/preferences.svelte";
	import { dragReorder } from "$lib/util/drag-reorder";

	let {
		albumId,
		content,
		isMine,
		busy,
		adding,
		opening,
		onView,
		onRemove,
		onReorder,
		onAdd,
	}: {
		albumId: number;
		content: AlbumContentResponse["content"];
		isMine: boolean;
		/** A move or a deletion is in flight, so nothing else may start one. */
		busy: boolean;
		adding: boolean;
		opening: boolean;
		onView: (index: number) => void;
		onRemove: (contentId: number) => void;
		onReorder: (from: number, to: number) => void;
		onAdd: () => void;
	} = $props();

	const isVideo = (item: AlbumContentResponse["content"][number]) =>
		item.contentType.startsWith("video/");

	const isProcessing = (item: AlbumContentResponse["content"][number]) =>
		item.processing === true;

	// A clip's `thumbUrl` 404s until the API has made a poster, so the poster is
	// asked for by id and drawn instead. Kept by content id: the album can be
	// re-read or reordered under this.
	// `null` marks one asked for and not given, so it is asked for once.
	let posters = $state<Record<number, string | null>>({});

	$effect(() => {
		for (const item of content) {
			if (!isVideo(item) || isProcessing(item)) continue;
			if (item.contentId in posters) continue;
			const contentId = item.contentId;
			posters = { ...posters, [contentId]: null };
			void getAlbumMediaPoster({ albumId, contentId })
				.then(({ posterUrl }) => {
					if (posterUrl !== null && posterUrl !== undefined)
						posters = { ...posters, [contentId]: posterUrl };
				})
				// No poster is not an error worth a toast: the tile keeps the
				// thumbnail the album read gave it.
				.catch((error: unknown) => console.error(error));
		}
	});
</script>

<div class="flex flex-col gap-2.5">
	<div class="flex items-center justify-between gap-2">
		<span class="section-label">Photos</span>
		{#if isMine && content.length > 1}
			<span class="text-2xs text-ink3">Hold a photo to reorder</span>
		{/if}
	</div>
	{#if content.length > 0 || isMine}
		<div
			class="object-grid reorder-grid"
			data-grid-columns={getAlbumGridColumnsSnapshot()}
			use:dragReorder={{ enabled: isMine && !busy, onReorder }}
		>
			{#if isMine}
				<!-- First, as in the official app, next to where an addition
				     lands. Not a slot that can be dragged. -->
				<button
					type="button"
					class="flex aspect-album-photo items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground disabled:opacity-50"
					disabled={adding || busy}
					onclick={onAdd}
					aria-label="Add photos"
				>
					{#if adding}
						<SpinnerGapIcon class="size-6 animate-spin" />
					{:else}
						<PlusIcon class="size-6" />
					{/if}
				</button>
			{/if}
			{#each content as item, index (item.contentId)}
				<div class="relative aspect-album-photo" data-reorder-item>
					<button
						type="button"
						class="size-full overflow-hidden rounded-lg"
						aria-label="View media"
						disabled={opening}
						onclick={() => onView(index)}
					>
						{#if isProcessing(item)}
							<!-- Nothing to draw yet: the API is still
							     transcoding, and every URL it gave for this
							     item 404s until it is done. -->
							<span
								class="flex size-full flex-col items-center justify-center gap-1.5 rounded-lg bg-media-placeholder text-2xs text-muted-foreground"
							>
								<SpinnerGapIcon
									class="size-5 animate-spin"
									aria-hidden="true"
								/>
								Processing
							</span>
						{:else}
							<img
								src={posters[item.contentId] ?? item.thumbUrl}
								alt=""
								class="size-full bg-media-placeholder object-cover"
								draggable="false"
							/>
						{/if}
					</button>
					{#if isVideo(item) && !isProcessing(item)}
						<!-- A clip's thumbnail is a still frame, so the tile has
						     to say there is a video behind it. -->
						<span
							class="pointer-events-none absolute top-1.5 left-1.5 flex size-6.5 items-center justify-center rounded-full bg-plate-strong text-plate-foreground"
						>
							<PlayIcon weight="fill" class="size-3.5" />
						</span>
					{/if}
					{#if isMine}
						<button
							type="button"
							class="absolute top-1.5 right-1.5 flex size-6.5 items-center justify-center rounded-full bg-plate-strong text-plate-foreground disabled:opacity-50"
							aria-label="Delete media"
							disabled={busy}
							onclick={() => onRemove(item.contentId)}
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
		<p
			class="w-full rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground"
		>
			No media yet
		</p>
	{/if}
</div>
