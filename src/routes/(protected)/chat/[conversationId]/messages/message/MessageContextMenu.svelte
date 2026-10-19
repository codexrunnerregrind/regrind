<script lang="ts">
	import { writeText } from "@tauri-apps/plugin-clipboard-manager";
	import ArrowBendUpLeftIcon from "phosphor-svelte/lib/ArrowBendUpLeftIcon";
	import ArrowUUpLeftIcon from "phosphor-svelte/lib/ArrowUUpLeftIcon";
	import CopyIcon from "phosphor-svelte/lib/CopyIcon";
	import FlagIcon from "phosphor-svelte/lib/FlagIcon";
	import FolderSimpleMinusIcon from "phosphor-svelte/lib/FolderSimpleMinusIcon";
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";
	import { toast } from "svelte-sonner";
	import type { ComponentProps } from "svelte";

	import fireEmoji from "$lib/assets/emojis/fire/32px.png";
	import ContextMenu from "$lib/components/shared/ContextMenu.svelte";
	import { Button } from "$lib/components/ui/button";

	let {
		textContent,
		reactionAvailable,
		onDelete,
		onUnsend,
		onUnshareAlbum,
		onReply,
		onCopyError,
		onReport,
		onReact,
		...props
	}: ComponentProps<typeof ContextMenu> & {
		textContent?: string;
		reactionAvailable?: boolean;
		onDelete?: () => void;
		onUnsend?: () => void;
		onUnshareAlbum?: () => void;
		onReply?: () => void;
		onCopyError?: () => void;
		onReport?: () => void;
		onReact?: (reactionId: number) => void;
	} = $props();
</script>

<ContextMenu {...props}>
	{#snippet header()}
		{#if reactionAvailable}
			<!-- a cursor cannot double-tap, so it gets the reaction itself
			     where a touchscreen gets the hint -->
			<span
				class={[
					"mb-2 block w-45 text-center text-foreground/50 text-shadow-sm can-hover:hidden",
				]}
			>
				Double tap to <img
					src={fireEmoji}
					alt="react with fire"
					width="16"
					height="16"
					class="inline align-middle"
					draggable="false"
				/>
			</span>
			<Button
				variant="ghost"
				size="icon-lg"
				aria-label="React with fire"
				class={[
					"mb-2 hidden self-start rounded-full bg-black/80 can-hover:inline-flex",
				]}
				onclick={() => {
					onReact?.(1);
					props.onClose();
				}}
			>
				<img
					src={fireEmoji}
					alt=""
					width="20"
					height="20"
					draggable="false"
				/>
			</Button>
		{/if}
	{/snippet}
	<div
		class="flex w-45 flex-col rounded-xl bg-black/80 p-1 *:justify-start *:active:translate-y-0!"
	>
		{#if onReply}
			<Button
				variant="ghost"
				onclick={() => {
					onReply();
					props.onClose();
				}}
			>
				<ArrowBendUpLeftIcon /> Reply
			</Button>
		{/if}
		{#if textContent !== undefined}
			<Button
				variant="ghost"
				onclick={() => {
					writeText(textContent)
						.then(() => {
							toast.success("Message copied to clipboard");
							props.onClose();
						})
						.catch((error) => console.error(error));
				}}
			>
				<CopyIcon /> Copy message
			</Button>
		{/if}
		{#if onCopyError}
			<Button
				variant="ghost"
				onclick={() => {
					onCopyError();
					props.onClose();
				}}
			>
				<WarningCircleIcon /> Copy error
			</Button>
		{/if}
		{#if onDelete}
			<Button
				variant="ghost"
				onclick={() => {
					onDelete();
					props.onClose();
				}}
			>
				<TrashIcon />
				Delete for me
			</Button>
		{/if}
		{#if onUnsend}
			<Button
				variant="ghost"
				onclick={() => {
					onUnsend();
					props.onClose();
				}}
			>
				<ArrowUUpLeftIcon />
				Unsend message
			</Button>
		{/if}
		{#if onUnshareAlbum}
			<Button
				variant="ghost"
				onclick={() => {
					onUnshareAlbum();
					props.onClose();
				}}
			>
				<FolderSimpleMinusIcon />
				Unshare album
			</Button>
		{/if}
		{#if onReport}
			<Button
				variant="ghost"
				onclick={() => {
					props.onClose();
					onReport();
				}}
			>
				<FlagIcon /> Report
			</Button>
		{/if}
	</div>
</ContextMenu>
