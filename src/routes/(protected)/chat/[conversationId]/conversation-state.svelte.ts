import { createContext } from "svelte";
import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import { errorUrn } from "$lib/api/error-urn";
import { markConversationAsRead } from "$lib/api/messaging/conversations";
import {
	ConversationUnavailableError,
	reactToMessage,
	sendMessage,
} from "$lib/api/messaging/messages";
import { getPreferences } from "$lib/app-data/preferences.svelte";
import {
	deletedConversationIds,
	deletedMessageIds,
} from "$lib/chat/message-deleted";
import { withRegionGrant } from "$lib/entitlements/expiring-media-entitlement";
import { previewFromMessage } from "$lib/model/messaging/message-preview";
import { reconciler } from "$lib/util/reconcile";
import type { ConversationsState } from "$lib/chat/conversations-state.svelte";
import type {
	ApiResponseMessage,
	MessageDraft,
	OutboundMessage,
} from "$lib/model/messaging/messages";
import type { ChatV1MessageDeletedEventPayload } from "$lib/ws.svelte";
import { subscribeConversationRealtime } from "./conversation-realtime";
import {
	matchPendingEcho,
	mergeServerMessages,
	type OptimisticMessage,
	removeDuplicateMessages,
} from "./merge-messages";
import { getConversation } from "./messages";
import {
	lockSharedAlbumInPlace,
	recordMediaViewsInPlace,
	unsendInPlace,
} from "./optimistic-edits";
import { ReadReceiptQueue } from "./read-receipts";

export type { OptimisticMessage };

export type ConversationProfile = Awaited<
	ReturnType<typeof getConversation>
>["profile"];

export class ConversationState {
	messages: OptimisticMessage[] = $state([]);
	profile: ConversationProfile | null = $state(null);
	pageKey: string | null = $state(null);
	loading = $state(true);
	loadingMore = $state(false);
	refreshing = $state(false);
	error: Error | null = $state(null);
	lastReadTimestamp: number | null = $state(null);
	#focusComposer: (() => void) | null = null;
	// Resolved from the stored id on every read, so unsending, deleting or
	// failing to load the target drops the quote with no clearing code.
	readonly replyTo: ApiResponseMessage | null = $derived.by(() => {
		const messageId = this.#conversations.drafts.replyTo(
			this.conversationId,
		);
		if (messageId === null) return null;
		const target = this.messages.find(
			(message) => message.messageId === messageId,
		);
		return target && !target.unsent ? target : null;
	});

	readonly conversationId: string;
	readonly ourProfileId: number;

	/** Is the other side typing right now? */
	get typing(): boolean {
		return this.#conversations.typing.isTyping(this.conversationId);
	}

	#conversations: ConversationsState;
	#readReceipts = new ReadReceiptQueue({
		markRead: (messageId) => this.#markRead(messageId),
	});
	#unsubscribeReconcile: () => void;

	constructor({
		conversationId,
		ourProfileId,
		conversations,
	}: {
		conversationId: string;
		ourProfileId: number;
		conversations: ConversationsState;
	}) {
		this.conversationId = conversationId;
		this.ourProfileId = ourProfileId;
		this.#conversations = conversations;
		conversations.setActive(conversationId);
		this.lastReadTimestamp = null;
		void this.#initialLoad();

		this.#unsubscribeReconcile = reconciler.subscribe(() =>
			this.#reconcileMessages(),
		);

		this.#wsPromises.push(
			...subscribeConversationRealtime({
				conversationId,
				alive: () => !this.#destroyed,
				onMessageSent: (message) => this.#handleMessageSent(message),
				onReadReceipt: ({ profileId, timestamp }) => {
					if (profileId === this.ourProfileId) return;
					if (this.#advanceLastRead(timestamp)) this.#syncCache();
				},
				onStale: () => {
					void this.#reconcileMessages();
				},
				onMessagesDeleted: (payload) =>
					this.#handleMessageDeleted(payload),
			}),
		);
	}

	#wsPromises: Promise<() => void>[] = [];

	#destroyed = false;
	#refreshRequestedSinceFetchStart = false;
	get destroyed(): boolean {
		return this.#destroyed;
	}
	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#conversations.clearActive(this.conversationId);
		for (const promise of this.#wsPromises) {
			promise
				.then((unlisten) => unlisten())
				.catch((error) => console.error(error));
		}
		this.#wsPromises = [];
		this.#unsubscribeReconcile();
		this.#readReceipts.destroy();
	}

	/**
	 * Fold an arriving message into the list: the server's version of one we
	 * already show, the echo of one we just sent, or a new one at the top.
	 */
	#handleMessageSent(incoming: ApiResponseMessage): void {
		const existing = this.messages.find(
			(m) => m.messageId === incoming.messageId,
		);
		if (existing) {
			const moved = existing.timestamp !== incoming.timestamp;
			Object.assign(existing, incoming, { status: "sent" as const });
			if (moved) this.#resortNewestFirst();
			this.#syncCache();
			return;
		}

		if (incoming.senderId === this.ourProfileId) {
			const pending = matchPendingEcho({
				messages: this.messages,
				incoming,
			});
			if (pending) {
				this.#adoptServerVersion({
					message: pending,
					serverMessageId: incoming.messageId,
					serverTimestamp: incoming.timestamp,
				});
				return;
			}
		}

		const newestTimestamp = this.messages.reduce(
			(max, m) => Math.max(max, m.timestamp),
			Number.NEGATIVE_INFINITY,
		);
		if (incoming.timestamp < newestTimestamp) return;

		const msg: OptimisticMessage = { ...incoming, status: "sent" };
		this.messages = [msg, ...this.messages];
		this.#syncCache();
		if (msg.senderId !== this.ourProfileId) {
			void this.reportRead({
				messageId: msg.messageId,
				timestamp: msg.timestamp,
			});
		}
	}

	/**
	 * Drop the messages a delete names. The payload is undocumented, so we only
	 * trust ids we can match against what we hold, and refetch whenever the
	 * event leaves us unable to point at anything — including when it names no
	 * conversation, since a delete we ignore would leave a message on screen
	 * that no longer exists.
	 */
	#handleMessageDeleted(
		payload: ChatV1MessageDeletedEventPayload["payload"],
	): void {
		const conversationIds = deletedConversationIds(payload);
		if (
			conversationIds.length > 0 &&
			!conversationIds.includes(this.conversationId)
		) {
			return;
		}

		const removed = deletedMessageIds(payload).filter((messageId) =>
			this.messages.some((message) => message.messageId === messageId),
		);
		for (const messageId of removed) this.remove(messageId);
		if (removed.length === 0) void this.#reconcileMessages();
	}

	async #reconcileMessages(): Promise<void> {
		if (this.#destroyed) return;
		if (this.loading || this.refreshing) {
			this.#refreshRequestedSinceFetchStart = true;
			return;
		}
		this.refreshing = true;
		this.#refreshRequestedSinceFetchStart = false;
		try {
			const result = await getConversation({
				conversationId: this.conversationId,
			});
			if (this.#destroyed) return;

			this.profile = result.profile;
			this.error = null;

			const { messages, fresh, changed } = mergeServerMessages({
				local: this.messages,
				server: result.messages,
			});

			this.#advanceLastRead(result.lastReadTimestamp);

			if (!changed) {
				this.#syncCache();
				return;
			}

			this.messages = messages;
			this.#updatePreview(this.messages.at(0));
			this.#syncCache();

			for (const m of fresh) {
				if (m.senderId === this.ourProfileId) continue;
				void this.reportRead({
					messageId: m.messageId,
					timestamp: m.timestamp,
				});
			}
		} catch (error) {
			if (this.#destroyed) return;
			console.error("Failed to reconcile messages", error);
			if (error instanceof ConversationUnavailableError) {
				this.error = error;
			} else {
				showErrorToast({
					label: "Failed to refresh messages",
					error,
					onRetry: () => void this.refresh(),
				});
			}
		} finally {
			this.refreshing = false;
			this.#runRequestedRefresh();
		}
	}

	#runRequestedRefresh(): void {
		if (!this.#refreshRequestedSinceFetchStart) return;
		this.#refreshRequestedSinceFetchStart = false;
		void this.refresh();
	}

	refresh(): Promise<void> {
		return this.#reconcileMessages();
	}

	retry(): void {
		if (this.#destroyed) return;
		void this.#initialLoad();
	}

	async #initialLoad(): Promise<void> {
		this.error = null;
		const cached = this.#conversations.getCachedConversation(
			this.conversationId,
		);
		if (cached) {
			this.messages = cached.messages.map((m) => ({
				...m,
				status: "sent" as const,
			}));
			this.profile = cached.profile;
			this.pageKey = cached.pageKey;
			this.lastReadTimestamp = cached.lastReadTimestamp;
			this.loading = false;
			void this.#conversations.markRead(this.conversationId);
			void this.#reconcileMessages();
			return;
		}
		this.loading = true;
		try {
			const result = await getConversation({
				conversationId: this.conversationId,
			});
			void this.#conversations.markRead(this.conversationId);
			if (this.#destroyed) return;
			this.messages = removeDuplicateMessages(
				result.messages.map((m) => ({ ...m, status: "sent" as const })),
			);
			this.profile = result.profile;
			this.pageKey = result.pageKey;
			this.#updatePreview(this.messages.at(0));
			this.#advanceLastRead(result.lastReadTimestamp);
			this.#syncCache();
		} catch (err) {
			if (this.#destroyed) return;
			this.error = err instanceof Error ? err : new Error(String(err));
		} finally {
			this.loading = false;
			this.#runRequestedRefresh();
		}
	}

	async loadMore(): Promise<void> {
		if (this.loadingMore || this.pageKey === null) return;
		this.loadingMore = true;
		try {
			const result = await getConversation({
				conversationId: this.conversationId,
				pageKey: this.pageKey,
			});
			if (this.#destroyed) return;
			this.messages = removeDuplicateMessages([
				...this.messages,
				...result.messages.map((m) => ({
					...m,
					status: "sent" as const,
				})),
			]);
			this.pageKey = result.pageKey;
			this.#advanceLastRead(result.lastReadTimestamp);
			this.#syncCache();
		} catch (error) {
			if (this.#destroyed) return;
			console.error(error);
			if (error instanceof ConversationUnavailableError) {
				this.error = error;
			} else {
				showErrorToast({
					label: "Failed to load more messages",
					error,
				});
			}
		} finally {
			this.loadingMore = false;
		}
	}

	/**
	 * Hands the composer back the caret the moment a reply is armed, rather than
	 * leaving it to an effect. iOS only makes room for a keyboard it raised from
	 * a user-initiated focus: a focus() deferred past the gesture's own task
	 * still gets the keyboard, but not the viewport shrink that goes with it, so
	 * visualViewport keeps reporting full height and applyKeyboardInset has
	 * nothing to compensate for — the swipe's keyboard lands on top of the
	 * field. Registered by the composer; the last one mounted wins.
	 */
	registerComposerFocus(focus: () => void): () => void {
		this.#focusComposer = focus;
		return () => {
			if (this.#focusComposer === focus) this.#focusComposer = null;
		};
	}

	setReplyTo(message: ApiResponseMessage): void {
		this.#conversations.drafts.setReplyTo({
			conversationId: this.conversationId,
			messageId: message.messageId,
		});
		// Synchronous on purpose — see registerComposerFocus.
		this.#focusComposer?.();
	}

	clearReplyTo(): void {
		this.#conversations.drafts.clearReplyTo(this.conversationId);
	}

	// One call per batch: the target is read once and cleared once, so every
	// message of a multi-photo reply quotes it, not just the first.
	send(drafts: MessageDraft[]): void {
		if (!this.profile) return;
		const replyToMessage = this.replyTo;
		for (const draft of drafts) this.#sendOne({ draft, replyToMessage });
		if (replyToMessage) this.clearReplyTo();
	}

	#sendOne({
		draft,
		replyToMessage,
	}: {
		draft: MessageDraft;
		replyToMessage: ApiResponseMessage | null;
	}): void {
		const tempId = `pending-${crypto.randomUUID()}`;
		const optimistic: OptimisticMessage = {
			...draft.optimistic,
			messageId: tempId,
			conversationId: this.conversationId,
			senderId: this.ourProfileId,
			timestamp: Date.now(),
			unsent: false,
			reactions: [],
			replyToMessage,
			status: "pending" as const,
		};
		this.messages = removeDuplicateMessages([optimistic, ...this.messages]);
		this.#updatePreview(optimistic);
		void this.#resolveMessage({
			tempId,
			message: draft.outbound,
			replyToMessageId: replyToMessage?.messageId,
		});
	}

	async #resolveMessage({
		tempId,
		message,
		replyToMessageId,
	}: {
		tempId: string;
		message: OutboundMessage;
		replyToMessageId?: string;
	}): Promise<void> {
		try {
			// A region-gated refusal grants and sends again, unseen.
			const toUserId = this.profile!.profileId;
			const sent = await withRegionGrant(() =>
				sendMessage({ toUserId, message, replyToMessageId }),
			);
			if (this.#destroyed) return;
			const msg = this.messages.find((m) => m.messageId === tempId);
			if (msg) {
				this.#adoptServerVersion({
					message: msg,
					serverMessageId: sent.messageId,
					serverTimestamp: sent.timestamp,
				});
			} else {
				this.#syncCache();
			}
			void this.#conversations.ensureLoaded(this.conversationId);
		} catch (error) {
			const urn = errorUrn(error);
			console.error(
				`Failed to send message${urn === null ? "" : ` (${urn})`}`,
				error,
			);
			if (
				message.type === "ExpiringImage" &&
				urn === "urn:gr:err:entitlement_limit"
			) {
				toast.error(
					"Daily expiring photo limit reached, sending more now requires Grindr subscription",
					{ id: "expiring-photo-limit" },
				);
			}
			const msg = this.messages.find((m) => m.messageId === tempId);
			if (msg) {
				msg.status = "error";
				msg.sendError = error;
			}
			const latestSent = this.messages.find((m) => m.status === "sent");
			this.#updatePreview(latestSent);
		}
	}

	#adoptServerVersion({
		message,
		serverMessageId,
		serverTimestamp,
	}: {
		message: OptimisticMessage;
		serverMessageId: string;
		serverTimestamp: number;
	}): void {
		const wasNewestBeforeAdopting =
			this.messages.at(0)?.messageId === message.messageId;
		message.status = "sent";
		message.messageId = serverMessageId;
		message.timestamp = serverTimestamp;
		this.#resortNewestFirst();
		const newest = this.messages.at(0);
		const isNewestAfterAdopting = newest?.messageId === serverMessageId;
		if (wasNewestBeforeAdopting || isNewestAfterAdopting) {
			this.#updatePreview(newest);
		}
		this.#syncCache();
	}

	#resortNewestFirst(): void {
		this.messages = removeDuplicateMessages(this.messages);
	}

	#advanceLastRead(timestamp: number | null): boolean {
		if (timestamp === null) return false;
		if (
			this.lastReadTimestamp !== null &&
			timestamp <= this.lastReadTimestamp
		)
			return false;
		this.lastReadTimestamp = timestamp;
		return true;
	}

	#syncCache(): void {
		if (!this.profile) return;
		const cachedMessages: ApiResponseMessage[] = this.messages
			.filter((m) => m.status === "sent")
			.map(({ status: _status, ...rest }) => {
				void _status;
				return rest;
			});
		this.#conversations.setCachedConversation({
			conversationId: this.conversationId,
			data: {
				messages: cachedMessages,
				profile: this.profile,
				pageKey: this.pageKey,
				lastReadTimestamp: this.lastReadTimestamp,
			},
		});
	}

	#updatePreview(message: OptimisticMessage | undefined) {
		this.#conversations.updatePreview({
			conversationId: this.conversationId,
			preview: previewFromMessage(message),
			timestamp: message?.timestamp ?? -1,
		});
	}

	remove(messageId: string) {
		const isLatest = this.messages.at(0)?.messageId === messageId;

		let revert = () => {};
		const index = this.messages.findIndex((m) => m.messageId === messageId);
		const removed = this.messages[index];
		if (removed) {
			this.messages.splice(index, 1);
			if (isLatest) this.#updatePreview(this.messages.at(0));
			this.#syncCache();
			const revertDeleteMessage = () => {
				this.messages.splice(index, 0, removed);
				if (isLatest) this.#updatePreview(removed);
				this.#syncCache();
			};

			const isOnly = this.messages.length === 0;
			let revertDeleteConversation = () => {};
			if (isOnly) {
				({ revert: revertDeleteConversation } =
					this.#conversations.remove(this.conversationId));
			}

			revert = () => {
				revertDeleteConversation();
				revertDeleteMessage();
			};
		}

		return { revert };
	}

	reportRead({
		messageId,
		timestamp,
	}: {
		messageId: string;
		timestamp: number;
	}): void {
		if (
			this.lastReadTimestamp !== null &&
			timestamp <= this.lastReadTimestamp
		)
			return;
		this.#readReceipts.push({ messageId, timestamp });
	}

	async #markRead(messageId: string): Promise<void> {
		const { revealMessageRead } = await getPreferences();
		if (!revealMessageRead) return;
		try {
			await markConversationAsRead({
				conversationId: this.conversationId,
				messageId,
			});
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to mark conversation as read",
				error,
			});
		}
	}

	async reactTo({
		messageId,
		reactionType,
	}: {
		messageId: string;
		reactionType: number;
	}): Promise<void> {
		const msg = this.messages.find((m) => m.messageId === messageId);
		// The received-photos viewer reaches back past what the chat has loaded,
		// so a message we can't show optimistically still gets its reaction sent.
		if (!msg) {
			await reactToMessage({
				conversationId: this.conversationId,
				messageId,
				reactionType,
			});
			return;
		}
		const optimistic = { reactionType, profileId: this.ourProfileId };
		msg.reactions.push(optimistic);
		this.#syncCache();
		try {
			await reactToMessage({
				conversationId: this.conversationId,
				messageId,
				reactionType,
			});
		} catch (err) {
			const idx = msg.reactions.findIndex((r) => r === optimistic);
			if (idx !== -1) msg.reactions.splice(idx, 1);
			if (!this.#destroyed) this.#syncCache();
			throw err;
		}
	}

	markMessageAsUnsent(messageId: string): { revert: () => void } {
		return unsendInPlace({
			messages: this.messages,
			messageId,
			sync: () => this.#syncCache(),
			refreshPreview: (message) => this.#updatePreview(message),
		});
	}

	/** Records what a fetch said is left of an expiring clip's views. */
	recordMediaViews(views: {
		messageId: string;
		viewsRemaining: number;
	}): void {
		recordMediaViewsInPlace({
			...views,
			messages: this.messages,
			sync: () => this.#syncCache(),
		});
	}

	lockSharedAlbum(albumId: number): { revert: () => void } {
		return lockSharedAlbumInPlace({
			messages: this.messages,
			albumId,
			ourProfileId: this.ourProfileId,
			sync: () => this.#syncCache(),
		});
	}
}

export const [getConversationState, setConversationState] =
	createContext<() => ConversationState>();
