<script lang="ts">
	import { VideoIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSingleMessage } from "$lib/api/messaging/messages";
	import { VIDEO_MESSAGE_TYPES } from "$lib/model/messaging/message-preview";
	import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let {
		conversationId,
		messageId,
		message,
	}: {
		conversationId: string;
		messageId: string;
		// The three video message bodies overlap only in these fields; the rest
		// (view counters, expiry) differ per variant and is read defensively.
		message: {
			url?: string | null;
			looping?: boolean | null;
			maxViews?: number | null;
			viewsRemaining?: number | null;
		};
	} = $props();

	const media = new MessageMediaState();

	const className: import("svelte/elements").ClassValue = $derived([
		"relative",
		{ "w-3/5 max-w-60 min-w-40": !media.clone, "size-full": media.clone },
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	const spent = $derived(
		message.viewsRemaining !== undefined &&
			message.viewsRemaining !== null &&
			message.viewsRemaining <= 0,
	);

	// A view-once video is fetched once and kept: the view is already spent, so
	// re-rendering must not cost another one.
	let fetchedUrl = $state<string | null>(null);
	let loading = $state(false);
	let aspectRatio = $state<string | null>(null);
	const url = $derived(message.url ?? fetchedUrl);

	async function loadVideo() {
		if (loading || url !== null) return;
		loading = true;
		try {
			const fetched = await getSingleMessage({
				conversationId,
				messageId,
			})
				.then((res) => apiResponseMessageSchema.parse(res.message))
				.then((parsed) =>
					VIDEO_MESSAGE_TYPES.includes(parsed.type)
						? ((parsed.body as { url?: string | null }).url ?? null)
						: null,
				);
			if (fetched === null) throw new Error("Video URL is null");
			fetchedUrl = fetched;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to load video", error });
		} finally {
			loading = false;
		}
	}
</script>

{#if spent}
	<!-- Matches the expired-image placeholder: nothing left to show, so the
	     bubble shrinks to a one-line notice rather than holding open a frame. -->
	<div class={["h-12", className, contentClass]} bind:this={media.el}>
		<LockedMedia
			class={[
				media.cornerClass,
				"gap-2 font-medium text-media-placeholder-foreground",
			]}
			size="sm"
		>
			Expired video
		</LockedMedia>
		{@render media.adornments?.()}
	</div>
{:else if url !== null}
	<div class={className} bind:this={media.el}>
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			src={url}
			controls
			playsinline
			preload="metadata"
			loop={message.looping === true}
			class={["w-full bg-black object-contain", contentClass]}
			style:aspect-ratio={aspectRatio ?? "3 / 4"}
			onloadedmetadata={(event) => {
				const { videoWidth, videoHeight } = event.currentTarget;
				// Portrait or landscape isn't known until the metadata lands, so the
				// bubble starts at the usual media 3:4 and takes the real shape once
				// it does — no cropping either way.
				if (videoWidth > 0 && videoHeight > 0) {
					aspectRatio = `${videoWidth} / ${videoHeight}`;
				}
			}}
		></video>
		{@render media.adornments?.()}
	</div>
{:else}
	<button
		class={[
			"flex items-center gap-2 px-4 py-3 text-start font-medium",
			"border border-border bg-input",
			className,
			contentClass,
			{ "opacity-50": loading, "cursor-pointer": !loading },
		]}
		onclick={() => void loadVideo()}
		disabled={loading}
		bind:this={media.el}
	>
		<VideoIcon size={24} weight="fill" class="shrink-0" />
		<span class="min-w-0 truncate">
			{message.maxViews === null || message.maxViews === undefined
				? "Load video"
				: "View video"}
		</span>
		{@render media.adornments?.()}
	</button>
{/if}
