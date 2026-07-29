<script lang="ts">
	import "photoswipe/style.css";

	import { showErrorToast } from "$lib/api/error";
	import { openImageGalleryLightbox } from "$lib/chat/image-gallery";
	import type { ImageMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../../conversation-state.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let {
		message,
		messageId,
	}: {
		message: ImageMessage["body"];
		messageId: string;
	} = $props();

	const media = new MessageMediaState();

	const conversationState = $derived(getConversationState()());

	// Every loose image in the conversation, oldest-first to match the visual
	// order, tagged with its sender so the gallery can stay on one side.
	const images = $derived(
		conversationState.messages
			.filter((m) => m.type === "Image")
			.map((m) => ({
				messageId: m.messageId,
				senderId: m.senderId,
				url: m.body.url,
				width: m.body.width,
				height: m.body.height,
			}))
			.reverse(),
	);

	let teardown: (() => void) | undefined;

	function openGallery(event: MouseEvent) {
		event.preventDefault();
		// Only swipe through images from the same side as the tapped one: open a
		// received pic and you browse received pics; open one you sent and you
		// browse the ones you sent.
		const tapped = images.find((i) => i.messageId === messageId);
		const sideImages = images.filter((i) => i.senderId === tapped?.senderId);
		const startIndex = sideImages.findIndex((i) => i.messageId === messageId);
		teardown?.();
		teardown = undefined;
		openImageGalleryLightbox(sideImages, {
			startIndex: startIndex < 0 ? 0 : startIndex,
			onClosed: () => {
				teardown?.();
				teardown = undefined;
			},
		})
			.then((destroy) => {
				teardown = destroy;
			})
			.catch((error) => {
				console.error(error);
				showErrorToast({ label: "Failed to open image", error });
			});
	}

	$effect(() => () => teardown?.());
</script>

<div
	class={["relative", { "ms-3 w-2/5 max-w-60 min-w-35": !media.clone }]}
	bind:this={media.el}
>
	<a
		href={message.url}
		rel="noreferrer"
		aria-label="Open image"
		class="item block"
		onclick={openGallery}
	>
		<img
			src={message.url}
			alt=""
			class={[
				"w-full rounded-lg bg-card-foreground/10 object-cover",
				media.cornerClass,
			]}
			style:aspect-ratio={message.width !== null && message.height !== null
				? `${message.width} / ${message.height}`
				: undefined}
			draggable="false"
		/>
	</a>
	{@render media.adornments?.()}
</div>

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
