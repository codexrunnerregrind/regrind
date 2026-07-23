<script lang="ts">
	import "photoswipe/style.css";
	import { ImageBrokenIcon, ImagesIcon, VideoIcon } from "phosphor-svelte";

	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import {
		AlbumLockedError,
		loadAlbum,
		type LoadedAlbum,
		openAlbumLightbox,
	} from "$lib/chat/album-viewer";
	import type { AlbumMessage } from "$lib/model/messaging/messages";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: AlbumMessage["body"] } = $props();

	const media = new MessageMediaState();

	const className: import("svelte/elements").ClassValue = $derived([
		"aspect-3/4 h-auto relative",
		{
			"ring ring-accent": message.hasUnseenContent,
			"w-2/5 min-w-35 max-w-60 ms-3": !media.clone,
			"size-full": media.clone,
		},
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	type AlbumState =
		| { status: "idle" }
		| { status: "loading" }
		| { status: "open"; album: LoadedAlbum };

	let albumState = $state<AlbumState>({ status: "idle" });
	let cachedAlbum: LoadedAlbum | null = null;

	function openAlbum() {
		if (cachedAlbum) {
			albumState = { status: "open", album: cachedAlbum };
		} else {
			albumState = { status: "loading" };
		}
	}

	$effect(() => {
		if (albumState.status !== "loading") return;
		loadAlbum(message.albumId)
			.then((loaded) => {
				cachedAlbum = loaded;
				albumState = { status: "open", album: loaded };
			})
			.catch((error) => {
				console.error(error);
				showErrorToast({
					label: "Failed to load album content",
					error,
				});
				albumState = { status: "idle" };
			});
	});

	$effect(() => {
		if (albumState.status !== "open") return;
		const { album } = albumState;
		let destroy: (() => void) | undefined;
		let canceled = false;
		openAlbumLightbox(album, {
			onClosed: () => {
				albumState = { status: "idle" };
			},
		})
			.then((teardown) => {
				if (canceled) {
					teardown();
				} else {
					destroy = teardown;
				}
			})
			.catch((error) => {
				if (error instanceof AlbumLockedError) {
					toast.info(error.message);
				} else {
					console.error(error);
					showErrorToast({
						label: "Failed to open album",
						error,
					});
				}
				albumState = { status: "idle" };
			});
		return () => {
			canceled = true;
			destroy?.();
			destroy = undefined;
		};
	});
</script>

{#if message.isViewable}
	<button
		class={[
			className,
			contentClass,
			{
				"cursor-pointer": albumState.status === "idle",
				"opacity-50": albumState.status === "loading",
			},
		]}
		onclick={openAlbum}
		disabled={albumState.status !== "idle"}
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
					class="aspect-square w-8 h-auto"
					color="var(--color-neutral-600)"
				/>
			</div>
		{/if}
		<div class={["@container absolute top-0 left-0 size-full", contentClass]}>
			<div
				class="absolute bottom-1/5 left-1/2 flex -translate-x-1/2 items-center gap-1 px-2 py-0.5 *:aspect-square *:w-[20cqw] *:rounded-full *:bg-card *:p-2"
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
	<div class={[className, contentClass]} bind:this={media.el}>
		<LockedMedia class={media.cornerClass} />
		{@render media.adornments?.()}
	</div>
{/if}

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
