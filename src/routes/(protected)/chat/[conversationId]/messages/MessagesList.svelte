<script lang="ts">
	import { toast } from "svelte-sonner";

	import { promptCopyError } from "$lib/api/error-copy";
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		forgetAlbumShared,
		getAlbumShared,
		setAlbumShared,
	} from "$lib/api/messaging/album-shares-state.svelte";
	import { unshareAlbum } from "$lib/api/messaging/albums";
	import {
		deleteMessageForMe,
		unsendMessage,
	} from "$lib/api/messaging/messages";
	import type { ApiResponseMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../conversation-state.svelte";
	import { processMessages } from "../messages";
	import Message from "./message/Message.svelte";

	let { seenMessageIds }: { seenMessageIds: Set<string> } = $props();

	const conversationState = $derived(getConversationState()());

	const ALBUM_MESSAGE_TYPES = ["Album", "ExpiringAlbum", "ExpiringAlbumV2"];

	/**
	 * The album to offer unsharing for, or null when the message isn't an album
	 * we own. Keyed off ownerProfileId rather than who sent the message: a
	 * forwarded album is not ours to unshare.
	 */
	function albumIdToUnshare(message: ApiResponseMessage): number | null {
		if (!ALBUM_MESSAGE_TYPES.includes(message.type)) return null;
		const body = message.body as {
			albumId?: number;
			ownerProfileId?: number | null;
		};
		if (body.ownerProfileId !== conversationState.ourProfileId) return null;
		const albumId = body.albumId;
		if (albumId === undefined) return null;

		// The message is a snapshot from when it was sent and does not change when
		// the share is revoked, so drop the action once we know it is gone.
		// Unknown still offers it: the API tolerates unsharing what isn't shared,
		// and hiding it on a guess would strand a share that is still live.
		const profileId = conversationState.profile?.profileId;
		if (
			profileId !== undefined &&
			getAlbumShared(albumId, profileId) === false
		) {
			return null;
		}
		return albumId;
	}

	const messages = $derived(
		processMessages({
			messages: conversationState.messages,
			ourProfileId: conversationState.ourProfileId,
		}),
	);
</script>

{#each messages.toReversed() as message (message.messageId)}
	{@const isOut = message.senderId === conversationState.ourProfileId}
	<Message
		{message}
		{isOut}
		indexInStack={message.indexInStack}
		stackLength={message.stackLength}
		dayStart={message.dayStart}
		status={message.status}
		isRead={isOut && message.messageId === messages[0]?.messageId
			? conversationState.lastReadTimestamp === message.timestamp
			: null}
		onVisible={!isOut
			? () => {
					seenMessageIds.add(message.messageId);
					conversationState.reportRead(message);
				}
			: undefined}
		onDelete={async () => {
			let revert: (() => void) | undefined;
			try {
				({ revert } = conversationState.remove(message.messageId));
				await deleteMessageForMe({
					conversationId: conversationState.conversationId,
					messageId: message.messageId,
				});
			} catch (error) {
				console.error(error);
				showErrorToast({ label: "Failed to delete message", error });
				revert?.();
			}
		}}
		onReply={message.status !== "pending" &&
		message.status !== "error" &&
		!message.unsent
			? () => conversationState.setReplyTo(message)
			: undefined}
		onReact={async (reactionType: number) => {
			try {
				await conversationState.reactTo({
					messageId: message.messageId,
					reactionType,
				});
			} catch (error) {
				console.error(error);
				showErrorToast({ label: "Failed to react to message", error });
			}
		}}
		onUnsend={isOut && !message.unsent
			? async () => {
					let revert: (() => void) | undefined;
					try {
						({ revert } = conversationState.markMessageAsUnsent(
							message.messageId,
						));
						await unsendMessage({
							conversationId: conversationState.conversationId,
							messageId: message.messageId,
						});
					} catch (error) {
						console.error(error);
						showErrorToast({
							label: "Failed to unsend message",
							error,
						});
						revert?.();
					}
				}
			: undefined}
		onUnshareAlbum={albumIdToUnshare(message) !== null
			? async () => {
					const albumId = albumIdToUnshare(message);
					const profileId = conversationState.profile?.profileId;
					if (albumId === null || profileId === undefined) return;
					// Optimistically lock the album bubble(s) so they show as no
					// longer viewable straight away; revert if the request
					// fails. The share state goes with them: a bubble reads it
					// over its own body, so leaving it saying "shared" would
					// keep the lock off until the request came back.
					const wasShared = getAlbumShared(albumId, profileId);
					const { revert } =
						conversationState.lockSharedAlbum(albumId);
					setAlbumShared(albumId, profileId, false);
					try {
						await unshareAlbum({
							albumId,
							profileIds: [profileId],
						});
						toast.success("Album unshared");
					} catch (error) {
						console.error(error);
						showErrorToast({
							label: "Failed to unshare album",
							error,
						});
						revert();
						if (wasShared === undefined)
							forgetAlbumShared(albumId, profileId);
						else setAlbumShared(albumId, profileId, wasShared);
					}
				}
			: undefined}
		onCopyError={message.status === "error"
			? () => void promptCopyError(message.sendError).catch(() => {})
			: undefined}
	/>
{/each}
