<script lang="ts">
	import {
		ClockIcon,
		ImageBrokenIcon,
		ImagesIcon,
		VideoIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { ApiError } from "$lib/api/api-error";
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		AlbumLockedError,
		type AlbumSharer,
		loadAlbum,
		loadPaywallAlbum,
		type LoadedAlbum,
		openAlbumLightbox,
	} from "$lib/chat/album-viewer";
	import { announcePaywallTeaser } from "$lib/components/albums/paywall-teaser-toast";
	import { profileMediaUrl } from "$lib/util/media";
	import { getNow } from "$lib/util/now";
	import type { AlbumMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../../conversation-state.svelte";
	import { albumExpiry } from "./album-expiry";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: AlbumMessage["body"] } = $props();

	const media = new MessageMediaState();
	const conversation = $derived(getConversationState()());

	const expiry = $derived(albumExpiry(message, getNow()));

	const className: import("svelte/elements").ClassValue = $derived([
		"aspect-3/4 h-auto relative",
		{
			"ring ring-accent": message.hasUnseenContent,
			"w-2/5 min-w-35 max-w-60": !media.clone,
			"size-full": media.clone,
		},
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	// Someone else's album gets the viewer's reply chrome; our own share opens
	// bare. The conversation partner is the sharer, so its profile is what the
	// header describes.
	const sharer = $derived.by<AlbumSharer | undefined>(() => {
		if (message.ownerProfileId === conversation.ourProfileId)
			return undefined;
		const profile = conversation.profile;
		return {
			name: profile?.name,
			avatarUrl:
				profile?.mediaHash === undefined || profile.mediaHash === null
					? null
					: profileMediaUrl({
							mediaHash: profile.mediaHash,
							size: "thumb",
						}),
			// The conversation profile reports metres, the viewer takes kilometres.
			distanceKm:
				profile?.distance === undefined || profile.distance === null
					? null
					: profile.distance / 1000,
		};
	});

	let phase = $state<"idle" | "loading" | "open">("idle");
	// Reopening the same album shouldn't refetch it.
	let cachedAlbum: LoadedAlbum | null = null;
	// Set once the album came from the paywall teaser rather than the album
	// itself: those slides have no ids to reply or react to.
	let cachedFromPaywall = false;
	let destroyLightbox: (() => void) | null = null;

	// The message can scroll out of the list (or the conversation can be left)
	// while the viewer is open, so the lightbox is torn down with it.
	$effect(() => () => {
		destroyLightbox?.();
		destroyLightbox = null;
	});

	async function openAlbum() {
		if (phase !== "idle") return;
		phase = "loading";
		try {
			if (cachedAlbum === null) {
				// An expired or locked share answers 403, or answers with no content
				// at all. Either way the paywall teaser still carries its media, so
				// the message stays openable instead of being a dead end.
				const album = message.isViewable
					? await loadAlbum(message.albumId).catch(
							(error: unknown) => {
								if (
									error instanceof ApiError &&
									error.response?.status === 403
								)
									return null;
								throw error;
							},
						)
					: null;
				if (album !== null && album.content.length > 0) {
					cachedAlbum = album;
				} else {
					// A teaser that errors out is still just an album we cannot
					// show, so it reports as locked rather than as its own failure.
					cachedAlbum = await loadPaywallAlbum({
						albumId: message.albumId,
						ownerProfileId: message.ownerProfileId,
					}).catch((error: unknown) => {
						console.error(error);
						return null;
					});
					cachedFromPaywall = true;
				}
				if (cachedAlbum === null) throw new AlbumLockedError();
			}
			destroyLightbox = await openAlbumLightbox(cachedAlbum, {
				sharer: cachedFromPaywall ? undefined : sharer,
				onClosed: () => {
					phase = "idle";
					destroyLightbox = null;
				},
			});
			phase = "open";
			if (cachedFromPaywall) announcePaywallTeaser();
		} catch (error) {
			phase = "idle";
			if (error instanceof AlbumLockedError) {
				toast.info(error.message);
			} else {
				console.error(error);
				showErrorToast({ label: "Failed to open album", error });
			}
		}
	}
</script>

{#if message.isViewable}
	<button
		class={[
			className,
			contentClass,
			{
				"cursor-pointer": phase === "idle",
				"opacity-50": phase === "loading",
			},
		]}
		aria-label="Open album"
		onclick={() => void openAlbum()}
		disabled={phase !== "idle"}
		bind:this={media.el}
	>
		{#if message.coverUrl !== null}
			<img
				src={message.coverUrl}
				alt=""
				class="absolute top-0 left-0 h-full w-full rounded-[inherit] bg-card-foreground/10 object-cover"
				draggable="false"
			/>
		{:else}
			<div
				class="flex size-full items-center justify-center rounded-[inherit] bg-card-foreground/20"
			>
				<ImageBrokenIcon
					weight="fill"
					class="aspect-square h-auto w-8"
					color="var(--media-placeholder-foreground)"
				/>
			</div>
		{/if}
		<div
			class={["@container absolute top-0 left-0 size-full", contentClass]}
		>
			{#if expiry !== null}
				<div
					class={[
						"absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white",
						{
							"bg-destructive/80": expiry.expired,
							"bg-black/60": !expiry.expired,
						},
					]}
				>
					<ClockIcon weight="fill" class="size-3.5 shrink-0" />
					<span class="truncate">{expiry.label}</span>
				</div>
			{/if}
			<!-- Centred in the cover: sitting a fifth up from the bottom read as a
			     misplaced badge rather than the album's own marker. -->
			<div
				class="absolute inset-0 flex items-center justify-center gap-1 px-2 py-0.5 *:aspect-square *:w-[20cqw] *:rounded-full *:bg-card *:p-2"
			>
				{#if message.hasPhoto}
					<div>
						<ImagesIcon
							width="100%"
							height="auto"
							weight="fill"
							color="var(--color-neutral-200)"
						/>
					</div>
				{/if}
				{#if message.hasVideo}
					<div>
						<VideoIcon
							width="100%"
							height="auto"
							weight="fill"
							color="var(--color-neutral-200)"
						/>
					</div>
				{/if}
			</div>
		</div>
		{@render media.adornments?.()}
	</button>
{:else}
	<!-- Still a button: the album is locked for us, but the paywall teaser it
	     appears in often still hands over its media, so tapping is worth a try
	     and falls back to the lock message when it isn't there. -->
	<button
		class={[
			className,
			contentClass,
			{
				"cursor-pointer": phase === "idle",
				"opacity-50": phase === "loading",
			},
		]}
		aria-label="Open album"
		onclick={() => void openAlbum()}
		disabled={phase !== "idle"}
		bind:this={media.el}
	>
		<LockedMedia class={media.cornerClass} />
		{@render media.adornments?.()}
	</button>
{/if}

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
