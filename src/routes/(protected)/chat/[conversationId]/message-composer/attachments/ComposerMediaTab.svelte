<script lang="ts">
	import { page } from "$app/state";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import PlayIcon from "phosphor-svelte/lib/PlayIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import VideoCameraIcon from "phosphor-svelte/lib/VideoCameraIcon";
	import VideoCameraSlashIcon from "phosphor-svelte/lib/VideoCameraSlashIcon";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		addMediaToDrawer,
		videoTranscodingSupported,
	} from "$lib/api/messaging/chat-media";
	import {
		deleteMediaFromDrawer,
		type DrawerMedia,
		getDrawerMedia,
	} from "$lib/api/messaging/drawer";
	import { asAppError } from "$lib/api/methods";
	import { getAlbumGridColumnsSnapshot } from "$lib/app-data/preferences.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import SelectionCheck from "$lib/components/shared/SelectionCheck.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as ContextMenu from "$lib/components/ui/context-menu";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { videoDurationSeconds } from "$lib/platform/video-metadata";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import { videoCall } from "$lib/video-call/call-state.svelte";
	import { getConversationState } from "../../conversation-state.svelte";
	import { getMessageComposerContext } from "../message-composer-context.svelte";
	import ComposerAddMedia from "./ComposerAddMedia.svelte";
	import {
		imageDraft,
		isVideo,
		videoDraft,
		type VideoViews,
		videoViewsControl,
	} from "./drawer-drafts";
	import {
		type Pending,
		pickForKind,
		queueWithRead,
		toPending,
	} from "./pending-media";

	let {
		onClose,
		onSelectionChange,
		onOverlayChange,
		expiring,
	}: {
		onClose: () => void;
		onSelectionChange: (count: number) => void;
		/** Raised while the add-media panel has the sheet to itself. */
		onOverlayChange?: (active: boolean) => void;
		expiring: boolean;
	} = $props();

	const composer = getMessageComposerContext();
	const selected = new SelectionSet<number>(10);

	// The official app pairs the two video actions in this sheet — record one,
	// or place a call — so the call sits beside "Add video" rather than only
	// behind the conversation menu.
	const conversationState = $derived(getConversationState()());
	const callBlockedReason = $derived(videoCall.blockedReason);
	// The allowance is account-wide and already in hand, so saying what is left
	// of it costs no request — and a call is worth starting knowing how long it
	// can run, since the server cuts it off when the time is spent.
	const callTimeLeft = $derived(videoCall.timeLeftLabel);

	function startCall() {
		const profile = conversationState.profile;
		if (callBlockedReason !== null || !profile) return;
		// The call takes the whole screen, so the sheet has no business staying
		// open underneath it.
		onClose();
		void videoCall.call({
			profileId: profile.profileId,
			name: profile.name ?? null,
			mediaHash: profile.mediaHash ?? null,
		});
	}

	let media = $state<DrawerMedia[] | null>(null);
	let error = $state<unknown>(null);
	let contextMenuUsed = $state(false);

	// A message carries one kind of media, so a selection does too: the tiles of
	// the other kind step aside for as long as one is held.
	const selectedVideo = $derived(
		media?.some((item) => selected.has(item.id) && isVideo(item)) ?? false,
	);
	const selectedImage = $derived(
		media?.some((item) => selected.has(item.id) && !isVideo(item)) ?? false,
	);

	function toggleSelected(item: DrawerMedia) {
		if (selected.has(item.id)) {
			selected.delete(item.id);
		} else {
			if (isVideo(item) ? selectedImage : selectedVideo) return;
			selected.add(item.id);
		}
		onSelectionChange(selected.size);
	}

	async function refresh() {
		media = await getDrawerMedia(page.params.conversationId as string);
	}

	async function load() {
		media = null;
		error = null;
		try {
			await refresh();
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	void load();

	// Asked once: whether a clip can be shrunk decides both how it is uploaded
	// and what the add panel says about its size.
	let canTranscode = $state(false);
	void videoTranscodingSupported()
		.then((supported) => (canTranscode = supported))
		.catch(() => (canTranscode = false));

	let queue = $state<Pending[]>([]);
	let adding = $state(false);
	// What the OS picker is busy fetching, if anything.
	let picking = $state<"image" | "video" | null>(null);
	const pending = $derived(queue[0] ?? null);

	$effect(() => {
		onOverlayChange?.(pending !== null || picking !== null);
	});

	// Anything still queued when the sheet goes away is a blob URL nobody will
	// come back for. Untracked, or the sweep would run on every change to the
	// queue and revoke the picks still waiting in it.
	$effect(() => () => {
		for (const item of untrack(() => queue)) {
			if (item.url !== null) URL.revokeObjectURL(item.url);
		}
	});

	async function pickToQueue(kind: "image" | "video") {
		let picked;
		const noun = kind === "image" ? "photo" : "video";
		// Held from before the OS picker opens: on iOS `open()` does not return
		// until the file has been copied out of the photo library — and pulled
		// down from iCloud first, if that is where it lives — which for a clip
		// is seconds of the app apparently doing nothing.
		picking = kind;
		try {
			picked = await pickForKind(kind);
		} catch (err) {
			console.error(err);
			toast.error(`Couldn't open the ${noun} picker`);
			return;
		} finally {
			picking = null;
		}
		if (picked.length === 0) return;
		// Straight onto the queue: the panel opens on what the picker already
		// said, and the file is read behind it.
		queue = [...queue, ...toPending({ picked, kind, canTranscode })];
	}

	// Reads whichever pick is on screen, once. A queued one waits its turn
	// rather than loading a batch of clips into memory at the same time.
	$effect(() => {
		const item = pending;
		if (item === null || item.bytes !== null) return;
		let stale = false;
		void queueWithRead(item, queue)
			.then((read) => {
				if (stale) URL.revokeObjectURL(read.url);
				else queue = read.queue;
			})
			.catch((err: unknown) => {
				console.error(err);
				if (stale) return;
				toast.error("Couldn't read that file");
				dropPending();
			});
		return () => {
			stale = true;
		};
	});

	function dropPending() {
		const [done, ...rest] = queue;
		if (done !== undefined && done.url !== null) {
			URL.revokeObjectURL(done.url);
		}
		queue = rest;
	}

	async function addPending({
		blob,
		takenOnGrindr,
	}: {
		blob: Blob | null;
		takenOnGrindr: boolean;
	}) {
		const item = pending;
		if (item === null || item.bytes === null || adding) return;
		adding = true;
		try {
			// `blob` is the cropped, rotated result; without one the file goes up
			// as it was picked, having been through one encoder fewer.
			const bytes =
				blob === null
					? item.bytes
					: new Uint8Array(await blob.arrayBuffer());
			const contentType = blob === null ? item.contentType : blob.type;
			await addMediaToDrawer({
				bytes,
				contentType,
				source: item.source,
				takenOnGrindr,
				durationSeconds: item.video
					? await videoDurationSeconds({ bytes, contentType })
					: null,
			});
			// Re-read rather than prepending what the upload answered with: the
			// drawer is the authority on what it holds, and a video's upload
			// response carries less than a photo's.
			await refresh();
			dropPending();
		} catch (err) {
			console.error(err);
			// The server's own words when it gave any, and "Copy details" either
			// way: a bare "Couldn't add video" hides the one thing worth knowing.
			showErrorToast({
				label:
					asAppError(err)?.prettyMessage ??
					(item.video ? "Couldn't add video" : "Couldn't add photo"),
				error: err,
			});
		} finally {
			adding = false;
		}
	}

	async function deleteMedia(id: number) {
		if (media === null) return;
		const index = media.findIndex((item) => item.id === id);
		if (index === -1) return;
		const [removed] = media.splice(index, 1);
		if (!removed) return;
		if (selected.has(id)) {
			selected.delete(id);
			onSelectionChange(selected.size);
		}
		try {
			await deleteMediaFromDrawer(id);
		} catch (err) {
			console.error(err);
			toast.error("Couldn't delete media");
			// Put it back where it was; an upload may have prepended since.
			media?.splice(Math.min(index, media.length), 0, removed);
		}
	}

	let videoViews = $state<VideoViews>("once");

	/**
	 * Photos take the sheet's own 10-second toggle; a clip counts views instead,
	 * so it puts its own control on the row above the send button.
	 */
	export function expiryControl() {
		return selectedVideo
			? videoViewsControl(videoViews, (v) => (videoViews = v))
			: null;
	}

	export function sendSelected() {
		if (media === null) return;
		const items = media.filter((item) => selected.has(item.id));
		const drafts = items.map((item) =>
			isVideo(item)
				? videoDraft(item, videoViews)
				: imageDraft(item, expiring),
		);
		selected.clear();
		onClose();
		for (const item of items) item.used = true;
		void composer().sendMessages(drafts);
	}
</script>

{#if pending === null && picking !== null}
	<!-- The pick itself is still being fetched, so the panel stands in for it
	     rather than leaving the sheet looking as though nothing happened. -->
	<ComposerAddMedia
		url={null}
		video={picking === "video"}
		adding
		onCancel={() => {}}
		onConfirm={() => {}}
	/>
{:else if pending !== null}
	<!-- Keyed on the pick: the next one in the queue starts from an untouched
	     crop and an unset watermark, not from what the last one was given. -->
	{#key pending.key}
		<ComposerAddMedia
			url={pending.url}
			video={pending.video}
			queued={queue.length - 1}
			{adding}
			onCancel={dropPending}
			onConfirm={(edit) => void addPending(edit)}
		/>
	{/key}
{:else}
	<!-- `-mx-4 px-gutter` cancels the sheet panel's padding so the margin around the
	     tiles is the same 2px as the gutter between them. -->
	<div
		class="@container/photo-grid -mx-4 flex flex-col rounded-grid px-gutter"
	>
		{#if error !== null}
			<div class="flex flex-1">
				<ApiErrorDisplay
					{error}
					onRetry={() => void load()}
					class="m-auto"
				/>
			</div>
		{:else if media === null}
			<div
				class="photo-grid"
				data-grid-columns={getAlbumGridColumnsSnapshot()}
			>
				{#each Array(12)}
					<Skeleton
						class="aspect-(--photo-grid-aspect) rounded-none"
					/>
				{/each}
			</div>
		{:else if media.length === 0}
			<Empty.Root>
				<Empty.Header>
					<Empty.Media variant="icon">
						<ImageIcon weight="fill" />
					</Empty.Media>
					<Empty.Title>No media sent yet</Empty.Title>
				</Empty.Header>
				<Empty.Content>
					<Button onclick={() => void pickToQueue("image")}>
						<PlusIcon weight="bold" />
						Add photo
					</Button>
					<Button
						variant="outline"
						onclick={() => void pickToQueue("video")}
					>
						<VideoCameraIcon weight="fill" />
						Add video
					</Button>
					<Button
						variant="outline"
						disabled={callBlockedReason !== null}
						onclick={startCall}
					>
						{#if callBlockedReason === null}
							<VideoCameraIcon weight="regular" />
							Video call
							{#if callTimeLeft !== null}
								<span class="text-ink3">· {callTimeLeft}</span>
							{/if}
						{:else}
							<VideoCameraSlashIcon weight="regular" />
							{callBlockedReason}
						{/if}
					</Button>
				</Empty.Content>
			</Empty.Root>
		{:else}
			<div
				class="photo-grid"
				data-grid-columns={getAlbumGridColumnsSnapshot()}
			>
				<button
					type="button"
					class="flex aspect-(--photo-grid-aspect) cursor-pointer flex-col items-center justify-center gap-1 bg-card-foreground/5 text-muted-foreground transition-colors hover:bg-card-foreground/10 hover:text-foreground"
					aria-label="Add photo"
					onclick={() => void pickToQueue("image")}
				>
					<PlusIcon weight="bold" class="size-6" />
					<span class="text-xs font-medium">Add photo</span>
				</button>
				<button
					type="button"
					class="flex aspect-(--photo-grid-aspect) cursor-pointer flex-col items-center justify-center gap-1 bg-card-foreground/5 text-muted-foreground transition-colors hover:bg-card-foreground/10 hover:text-foreground"
					aria-label="Add video"
					onclick={() => void pickToQueue("video")}
				>
					<VideoCameraIcon weight="fill" class="size-6" />
					<span class="text-xs font-medium">Add video</span>
				</button>
				<!-- Not a selectable tile: it sends nothing and closes the
				     sheet behind the call. -->
				<button
					type="button"
					class="flex aspect-(--photo-grid-aspect) flex-col items-center justify-center gap-1 bg-card-foreground/5 text-muted-foreground transition-colors not-disabled:cursor-pointer not-disabled:hover:bg-card-foreground/10 not-disabled:hover:text-foreground disabled:opacity-50"
					aria-label="Video call"
					disabled={callBlockedReason !== null}
					onclick={startCall}
				>
					{#if callBlockedReason === null}
						<VideoCameraIcon weight="regular" class="size-6" />
						<span class="text-xs font-medium">Video call</span>
						{#if callTimeLeft !== null}
							<span class="text-2xs leading-none text-ink3"
								>{callTimeLeft}</span
							>
						{/if}
					{:else}
						<VideoCameraSlashIcon weight="regular" class="size-6" />
						<span class="text-center text-xs font-medium"
							>{callBlockedReason}</span
						>
					{/if}
				</button>
				{#each media as item (item.id)}
					{@const isSelected = selected.has(item.id)}
					{@const video = isVideo(item)}
					{@const blocked =
						!isSelected && (video ? selectedImage : selectedVideo)}
					<ContextMenu.Root
						onOpenChange={(open) => {
							if (open) contextMenuUsed = true;
						}}
					>
						<!-- `flex`, not the default block: the inline-flex button inside would
						     otherwise sit on a text line box, adding ~5px under every tile and
						     making the row gaps read wider than the column gaps. -->
						<ContextMenu.Trigger
							class="relative flex aspect-square [-webkit-touch-callout:none] **:[-webkit-touch-callout:none]"
						>
							<button
								type="button"
								class={[
									"relative size-full rounded-[inherit]",
									{
										"cursor-pointer":
											selected.canSelectMore ||
											isSelected,
										"opacity-30": blocked,
									},
								]}
								aria-label={isSelected
									? "Deselect media"
									: "Select media"}
								aria-pressed={isSelected}
								disabled={blocked}
								onclick={() => toggleSelected(item)}
							>
								{#if video}
									<!-- Its own first frame is the thumbnail: the
									     drawer hands back no poster, and nudging the
									     time off zero is what makes one paint. -->
									<video
										src={item.url}
										muted
										playsinline
										preload="metadata"
										class="size-full rounded-[inherit] bg-card-foreground/10 object-cover"
										onloadedmetadata={(event) =>
											(event.currentTarget.currentTime = 0.001)}
									></video>
									{#if !isSelected}
										<div
											class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/20"
										>
											<span
												class="flex size-8 items-center justify-center rounded-full bg-black/60"
											>
												<PlayIcon
													weight="fill"
													class="size-4 text-white"
												/>
											</span>
										</div>
									{/if}
								{:else}
									<MediaImage
										src={item.url}
										class="size-full rounded-[inherit]"
										imgClass="bg-card-foreground/10"
									/>
								{/if}
								{#if isSelected}
									<div
										class="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-primary/50 outline-2 -outline-offset-2 outline-primary"
									>
										<SelectionCheck />
									</div>
								{:else if item.used}
									<div
										class="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/50"
									>
										<span class="font-medium text-white"
											>Sent</span
										>
									</div>
								{/if}
							</button>
						</ContextMenu.Trigger>
						{#if contextMenuUsed}
							<ContextMenu.Content class="w-48">
								<ContextMenu.Item
									variant="destructive"
									onSelect={() => void deleteMedia(item.id)}
								>
									<TrashIcon class="size-5" />
									{video ? "Delete Video" : "Delete Photo"}
								</ContextMenu.Item>
							</ContextMenu.Content>
						{/if}
					</ContextMenu.Root>
				{/each}
			</div>
		{/if}
		<div role="status" class="sr-only">
			{selected.size === selected.max
				? `Maximum ${selected.max} selected`
				: ""}
		</div>
	</div>
{/if}
