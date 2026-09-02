<script lang="ts">
	import { page } from "$app/state";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import VideoCameraIcon from "phosphor-svelte/lib/VideoCameraIcon";
	import VideoCameraSlashIcon from "phosphor-svelte/lib/VideoCameraSlashIcon";
	import { toast } from "svelte-sonner";

	import {
		addMediaToDrawer,
		uploadChatVideo,
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
	import {
		pickMedia,
		pickMultipleMedia,
		readMediaBytes,
	} from "$lib/platform/media-picker";
	import { videoDurationSeconds } from "$lib/platform/video-metadata";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import { videoCall } from "$lib/video-call/call-state.svelte";
	import { getConversationState } from "../../conversation-state.svelte";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	let {
		onClose,
		onSelectionChange,
		expiring,
	}: {
		onClose: () => void;
		onSelectionChange: (count: number) => void;
		expiring: boolean;
	} = $props();

	const composer = getMessageComposerContext();
	const selected = new SelectionSet<number>(10);

	// The official app pairs the two video actions in this sheet — record one,
	// or place a call — so the call sits beside "Send video" rather than only
	// behind the conversation menu.
	const conversationState = $derived(getConversationState()());
	const callBlockedReason = $derived(videoCall.blockedReason);

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

	function toggleSelected(id: number) {
		selected.toggle(id);
		onSelectionChange(selected.size);
	}

	let media = $state<DrawerMedia[] | null>(null);
	let error = $state<unknown>(null);
	let uploadingCount = $state(0);
	let contextMenuUsed = $state(false);

	async function load() {
		media = null;
		error = null;
		try {
			media = await getDrawerMedia(page.params.conversationId as string);
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	void load();

	async function addPhoto() {
		let picked;
		try {
			picked = await pickMultipleMedia("image");
		} catch (err) {
			console.error(err);
			toast.error("Couldn't open the photo picker");
			return;
		}
		if (picked.length === 0) return;

		uploadingCount += picked.length;
		for (const item of picked) {
			try {
				const added = await addMediaToDrawer(item);
				media = [
					added,
					...(media ?? []).filter(({ id }) => id !== added.id),
				];
			} catch (err) {
				console.error(err);
				const rejected = asAppError(err);
				if (
					rejected?.kind === "Media" &&
					typeof rejected.message === "string"
				) {
					toast.error(rejected.message);
				} else {
					toast.error("Couldn't add photo");
				}
			} finally {
				uploadingCount--;
			}
		}
	}

	/**
	 * How many times the recipient may open a video. Two is what the API's own
	 * clips come with; more than that is a different message type entirely
	 * (`NonExpiringVideo`), which is not on offer here.
	 */
	const VIDEO_MAX_VIEWS = 2;

	/**
	 * A video goes straight out rather than into the grid: the drawer the tiles
	 * come from holds photos, so there is nowhere to keep one — picking it in the
	 * OS picker is the choice, and this sends it.
	 */
	async function addVideo() {
		let picked;
		try {
			picked = await pickMedia("video");
		} catch (err) {
			console.error(err);
			toast.error("Couldn't open the video picker");
			return;
		}
		if (picked === null) return;

		onClose();
		const pending = toast.loading("Sending video…");
		try {
			const bytes = await readMediaBytes(picked);
			const contentType = picked.mimeType ?? "video/mp4";
			const durationSeconds = await videoDurationSeconds({
				bytes,
				contentType,
			});
			const uploaded = await uploadChatVideo({
				bytes,
				contentType,
				durationSeconds,
			});
			await composer().sendMessages([
				{
					outbound: {
						type: "Video",
						body: {
							mediaId: uploaded.mediaId,
							looping: false,
							maxViews: VIDEO_MAX_VIEWS,
						},
					},
					optimistic: {
						type: "Video",
						body: {
							mediaId: uploaded.mediaId,
							url: uploaded.url,
							contentType,
							length: durationSeconds ?? 0,
							maxViews: VIDEO_MAX_VIEWS,
							looping: false,
							viewsRemaining: VIDEO_MAX_VIEWS,
						},
					},
				},
			]);
			toast.dismiss(pending);
		} catch (err) {
			console.error(err);
			toast.dismiss(pending);
			const rejected = asAppError(err);
			toast.error(
				rejected?.kind === "Media" &&
					typeof rejected.message === "string"
					? rejected.message
					: "Couldn't send video",
			);
		}
	}

	async function deletePhoto(id: number) {
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
			toast.error("Couldn't delete photo");
			// Put it back where it was; an upload may have prepended since.
			media?.splice(Math.min(index, media.length), 0, removed);
		}
	}

	function imageHashFromUrl(url: string): string {
		return /([0-9a-f]{64}|[0-9a-f]{40})/i.exec(url)?.[1] ?? "";
	}

	export function sendSelected() {
		if (media === null) return;
		const items = media.filter((item) => selected.has(item.id));
		const sendAsExpiring = expiring;
		selected.clear();
		onClose();
		for (const item of items) item.used = true;
		void composer().sendMessages(
			items.map((item) => {
				const mediaBody = {
					mediaId: item.id,
					width: null,
					height: null,
					url: item.url,
				};
				return sendAsExpiring
					? {
							outbound: {
								type: "ExpiringImage",
								body: { mediaId: item.id, expiring: true },
							},
							optimistic: {
								type: "ExpiringImage",
								body: mediaBody,
							},
						}
					: {
							outbound: {
								type: "Image",
								body: { mediaId: item.id },
							},
							optimistic: {
								type: "Image",
								body: {
									...mediaBody,
									imageHash: imageHashFromUrl(item.url),
									takenOnGrindr: item.takenOnGrindr,
									createdAt: item.createdTs,
								},
							},
						};
			}),
		);
	}
</script>

<!-- `-mx-4 px-gutter` cancels the sheet panel's padding so the margin around the
     tiles is the same 2px as the gutter between them. -->
<div class="@container/photo-grid -mx-4 flex flex-col rounded-grid px-gutter">
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
				<Skeleton class="aspect-(--photo-grid-aspect) rounded-none" />
			{/each}
		</div>
	{:else if media.length === 0 && uploadingCount === 0}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon">
					<ImageIcon weight="fill" />
				</Empty.Media>
				<Empty.Title>No media sent yet</Empty.Title>
			</Empty.Header>
			<Empty.Content>
				<Button onclick={addPhoto}>
					<PlusIcon weight="bold" />
					Add photo
				</Button>
				<Button variant="outline" onclick={() => void addVideo()}>
					<VideoCameraIcon weight="fill" />
					Send video
				</Button>
				<Button
					variant="outline"
					disabled={callBlockedReason !== null}
					onclick={startCall}
				>
					{#if callBlockedReason === null}
						<VideoCameraIcon weight="regular" />
						Video call
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
				onclick={addPhoto}
			>
				<PlusIcon weight="bold" class="size-6" />
				<span class="text-xs font-medium">Add photo</span>
			</button>
			<!-- Not a selectable tile: there is nothing to keep it in, so this
			     picks a video and sends it. -->
			<button
				type="button"
				class="flex aspect-(--photo-grid-aspect) cursor-pointer flex-col items-center justify-center gap-1 bg-card-foreground/5 text-muted-foreground transition-colors hover:bg-card-foreground/10 hover:text-foreground"
				aria-label="Send video"
				onclick={() => void addVideo()}
			>
				<VideoCameraIcon weight="fill" class="size-6" />
				<span class="text-xs font-medium">Send video</span>
			</button>
			<!-- Also not a selectable tile: it sends nothing and closes the
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
				{:else}
					<VideoCameraSlashIcon weight="regular" class="size-6" />
					<span class="text-center text-xs font-medium"
						>{callBlockedReason}</span
					>
				{/if}
			</button>
			{#each Array(uploadingCount)}
				<Skeleton class="aspect-(--photo-grid-aspect) rounded-none" />
			{/each}
			{#each media as item (item.id)}
				{@const isSelected = selected.has(item.id)}
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
										selected.canSelectMore || isSelected,
								},
							]}
							aria-label={isSelected
								? "Deselect media"
								: "Select media"}
							aria-pressed={isSelected}
							onclick={() => toggleSelected(item.id)}
						>
							<MediaImage
								src={item.url}
								class="size-full rounded-[inherit]"
								imgClass="bg-card-foreground/10"
							/>
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
								onSelect={() => void deletePhoto(item.id)}
							>
								<TrashIcon class="size-5" />
								Delete Photo
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
