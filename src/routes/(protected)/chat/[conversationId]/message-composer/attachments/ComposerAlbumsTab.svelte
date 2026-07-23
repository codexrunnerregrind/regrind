<script lang="ts">
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImageBrokenIcon from "phosphor-svelte/lib/ImageBrokenIcon";
	import PaperPlaneTiltIcon from "phosphor-svelte/lib/PaperPlaneTiltIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import { getMyAlbums } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { MyAlbum } from "$lib/model/messaging/albums";
	import { getConversationState } from "../../conversation-state.svelte";

	let {
		onClose,
	}: {
		onClose: () => void;
	} = $props();

	const conversationState = $derived(getConversationState()());

	// Albums we've already shared into this conversation show up as our own
	// outgoing album messages. A still-viewable album message means the
	// recipient can currently see it; unsharing locks it, clearing the badge.
	const sharedAlbumIds = $derived(
		new Set(
			conversationState.messages
				.filter(
					(message) =>
						!message.unsent &&
						message.senderId === conversationState.ourProfileId &&
						(message.type === "Album" ||
							message.type === "ExpiringAlbum" ||
							message.type === "ExpiringAlbumV2") &&
						(message.body as { isViewable: boolean }).isViewable,
				)
				.map((message) => (message.body as { albumId: number }).albumId),
		),
	);

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

	async function share(albumId: number) {
		try {
			await conversationState.shareAlbums([albumId]);
			onClose();
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to share album", error: err });
		}
	}

	async function unshare(albumId: number) {
		try {
			await conversationState.unshareAlbum(albumId);
			toast.success("Album unshared");
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to unshare album", error: err });
		}
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
				{@const isShared = sharedAlbumIds.has(album.albumId)}
				{@const cover =
					album.content[0]?.thumbUrl || album.content[0]?.coverUrl}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props: { class: className, ...props } })}
							<button
								{...props}
								type="button"
								class={[className, "relative aspect-3/4"]}
								aria-label={isShared
									? "Unshare album"
									: "Share album"}
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
									<span
										class="line-clamp-2 text-xs font-medium text-white"
									>
										{album.albumName || "Untitled album"}
									</span>
								</div>
								{#if isShared}
									<span
										class="pointer-events-none absolute top-1.5 left-1.5 rounded-full bg-primary/90 px-2 py-0.5 text-xs font-medium text-primary-foreground"
									>
										Shared
									</span>
								{/if}
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="w-42" align="start">
						{#if isShared}
							<DropdownMenu.Item
								onSelect={() => void unshare(album.albumId)}
							>
								<EyeSlashIcon class="size-5" />
								Unshare album
							</DropdownMenu.Item>
						{:else}
							<DropdownMenu.Item
								onSelect={() => void share(album.albumId)}
							>
								<PaperPlaneTiltIcon class="size-5" />
								Share album
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/each}
		</div>
	{/if}
</div>
