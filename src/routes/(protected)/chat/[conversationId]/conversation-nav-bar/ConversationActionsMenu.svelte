<script lang="ts">
	import "photoswipe/style.css";
	import { DotsThreeIcon, ImageIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import { openImageGalleryLightbox } from "$lib/chat/image-gallery";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { getConversationState } from "../conversation-state.svelte";

	let { profileId }: { profileId: number } = $props();

	const conversationState = $derived(getConversationState()());

	// Photos this person has sent us, oldest-first to match the chat order.
	const receivedPhotos = $derived(
		conversationState.messages
			.filter((m) => m.type === "Image")
			.filter((m) => m.senderId === profileId)
			.map((m) => ({
				url: m.body.url,
				width: m.body.width,
				height: m.body.height,
			}))
			.reverse(),
	);

	let teardown: (() => void) | undefined;

	function openReceivedPhotos() {
		if (receivedPhotos.length === 0) {
			toast.info("No received photos yet");
			return;
		}
		teardown?.();
		teardown = undefined;
		openImageGalleryLightbox(receivedPhotos, {
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
				showErrorToast({ label: "Failed to open received photos", error });
			});
	}

	$effect(() => () => teardown?.());
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				type="button"
				aria-label="Conversation menu"
				class="flex h-full w-14 shrink-0 items-center justify-center text-foreground"
				{...props}
			>
				<DotsThreeIcon size={26} weight="bold" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-48" align="end">
		<DropdownMenu.Item onSelect={openReceivedPhotos}>
			<ImageIcon class="size-5" />
			Received photos
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
