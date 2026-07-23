<script lang="ts">
	import { page } from "$app/state";
	import { ArrowLeftIcon } from "phosphor-svelte";

	import {
		type AlbumContentResponse,
		getAlbumContent,
	} from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";

	const albumId = $derived(Number(page.params.albumId));

	let album = $state<AlbumContentResponse | null>(null);
	let error = $state<unknown>(null);

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
	<span class="min-w-0 truncate">
		{album?.albumName ?? "Album"}
	</span>
</ProgressiveBlur>

<main class="screen-nav-host">
	<div class="h-full w-full overflow-y-auto overscroll-none">
		<div class="flex w-full px-4 pt-19 pb-nav-clear">
			<div class="m-auto flex w-full max-w-200 flex-col gap-3 pb-16">
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
						{#each album.content as item (item.contentId)}
							<img
								src={item.thumbUrl}
								alt=""
								class="aspect-square size-full bg-card-foreground/10 object-cover"
								draggable="false"
							/>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</main>
