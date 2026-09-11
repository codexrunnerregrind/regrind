import { page } from "$app/state";

import { showErrorToast } from "$lib/api/error-toast";
import {
	deleteConversationForMe,
	getConversations,
	markConversationAsRead,
	setConversationMuted,
	setConversationPinned,
} from "$lib/api/messaging/conversations";
import { onProfileEdit } from "$lib/api/users/profiles";
import { InboxViewedMarker } from "$lib/chat/inbox-last-viewed.svelte";
import { InboxPaging } from "$lib/chat/inbox-paging.svelte";
import { applyOptimisticBatch } from "$lib/chat/optimistic-batch";
import { previewFromMessage } from "$lib/model/messaging/message-preview";
import { below } from "$lib/util/breakpoints.svelte";
import { reconciler } from "$lib/util/reconcile";
import type { Conversation } from "$lib/model/messaging/conversations";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import type { CachedConversation } from "./cached-conversation";
import { CoalescedRefresh } from "./coalesced-refresh";
import {
	applyFavoriteEdit,
	ConversationFilters,
	type ConversationFilterSelection,
	inboxFilterRequest,
} from "./conversation-filters.svelte";
import {
	type OptimisticFlagField,
	setConversationFlag,
} from "./conversation-flags";
import { fetchConversationWindow } from "./conversation-window";
import { subscribeInboxRealtime } from "./conversations-realtime";
import { Drafts } from "./drafts.svelte";
import { FetchEpochs } from "./fetch-epochs";
import { mergeIntoExisting, sortConversations } from "./inbox-entries";
import { MessageCache } from "./message-cache";
import { PendingDeletes } from "./pending-deletes";
import { PendingFlags } from "./pending-flags";
import { RememberedConversationFlags } from "./remembered-conversation-flags";
import { SeenMessages } from "./seen-messages";
import { TypingTracker } from "./typing.svelte";
import { UnreadWhileMissing } from "./unread-while-missing";

const singleColumnLayout = below("split");

/** Long enough to fold a burst of server signals into one refetch. */
const REFRESH_COALESCE_MS = 500;

/** The two tabs of the inbox list. */
export type InboxTab = "inbox" | "albums";

export type IncomingMessageHandler = (incoming: {
	message: ApiResponseMessage;
	conversation: Conversation;
}) => void;

class ConversationsState {
	entries = $state<Conversation[]>([]);
	// A filtered page can come back gated, with every flag reading "off"; this
	// puts back what the unfiltered list already knew.
	#rememberedFlags = new RememberedConversationFlags();
	nextPage = $state<number | null>(null);
	refreshing = $state(false);
	loading = $state(true);
	error: Error | null = $state(null);
	scrollY = 0;
	/**
	 * Which tab the list shows. Lives here, next to {@link scrollY}, so leaving
	 * the inbox (into My Albums, or a conversation) and coming back returns to
	 * the tab you left from instead of resetting to Inbox.
	 */
	activeTab = $state<InboxTab>("inbox");

	#initialLoad: Promise<unknown> = Promise.resolve();

	readonly ourProfileId: number;
	readonly drafts = new Drafts();
	readonly filters = new ConversationFilters();
	readonly inboxViewed: InboxViewedMarker;
	readonly typing = new TypingTracker();
	readonly paging: InboxPaging;
	#onIncomingMessage: IncomingMessageHandler;
	#activeConversationId: string | null = null;
	#wsPromises: Promise<() => void>[] = [];
	#messageCache = new MessageCache();
	#unsubscribeReconcile: () => void;
	#destroyed = false;
	#pendingFlags = new PendingFlags<OptimisticFlagField>();
	#pendingDeletes = new PendingDeletes();
	#seenMessages = new SeenMessages();
	#unreadWhileMissing = new UnreadWhileMissing();
	#fetches = new FetchEpochs();
	#refreshRequestedSinceFetchStart = false;
	#syncLatestInFlight: Promise<boolean> | null = null;
	#coalescedRefresh = new CoalescedRefresh({
		run: () => void this.refresh(),
		delayMs: REFRESH_COALESCE_MS,
	});
	#unsubscribeProfileEdits = onProfileEdit(({ profileId, patch }) => {
		if (patch.isFavorite === undefined) return;
		applyFavoriteEdit({
			entries: this.entries,
			profileId,
			isFavorite: patch.isFavorite,
		});
	});

	constructor({
		ourProfileId,
		onIncomingMessage,
	}: {
		ourProfileId: number;
		onIncomingMessage: IncomingMessageHandler;
	}) {
		this.ourProfileId = ourProfileId;
		this.#onIncomingMessage = onIncomingMessage;
		this.inboxViewed = new InboxViewedMarker({ profileId: ourProfileId });
		this.paging = new InboxPaging({
			loadPage: (page) => this.#fetches.track(this.#load(page)),
			cursor: () => this.nextPage,
		});
		void this.#hardLoad();

		this.#unsubscribeReconcile = reconciler.subscribe(() =>
			this.#fetches.track(this.#reconcile()),
		);

		this.#wsPromises.push(
			...subscribeInboxRealtime({
				alive: () => !this.#destroyed,
				onMessageSent: (message) => {
					void this.#handleMessageSent(message);
				},
				onConversationsDeleted: (ids) => {
					for (const id of ids) {
						this.remove(id);
						this.typing.forget(id);
						this.#markServerDeleted(id);
					}
				},
				// The rows are already on screen, so a refetch of the window is
				// what shows the change.
				onConversationsUpdated: (ids) => {
					for (const id of ids) this.invalidateConversation(id);
					this.#coalescedRefresh.request();
				},
				onInboxStale: () => this.#coalescedRefresh.request(),
				// The stored messages still say what they said when sent, so
				// drop them and let the screen refetch.
				onAlbumChanged: (id) => this.invalidateConversation(id),
				onMessagesDeleted: (ids) => {
					for (const id of ids) this.invalidateConversation(id);
					// The deleted message may be the one a row previews.
					this.#coalescedRefresh.request();
				},
				onTyping: ({ conversationId, profileId, status }) => {
					// Our own typing, echoed from another device, is not news.
					if (profileId === this.ourProfileId) return;
					this.typing.note({ conversationId, profileId, status });
				},
			}),
		);
	}

	async destroy(): Promise<void> {
		this.#destroyed = true;
		this.paging.destroy();
		this.drafts.destroy();
		this.typing.destroy();
		this.#coalescedRefresh.cancel();
		this.#unsubscribeReconcile();
		this.#unsubscribeProfileEdits();
		const unlisteners = await Promise.all(this.#wsPromises);
		for (const unlisten of unlisteners) unlisten();
		this.#wsPromises = [];
	}

	get visibleEntries(): Conversation[] {
		if (!this.filters.any) return this.entries;
		return this.entries.filter((entry) => this.filters.matches(entry));
	}

	setFilters(selection: Partial<ConversationFilterSelection>): void {
		if (this.filters.set(selection)) this.retry();
	}

	async #handleMessageSent(message: ApiResponseMessage): Promise<void> {
		const conversationId = message.conversationId;
		const isIncoming = message.senderId !== this.ourProfileId;
		// Sending ends typing. The server says so too, with a `Sent` status,
		// but the message is the one signal that cannot arrive out of order.
		this.typing.clear({ conversationId, profileId: message.senderId });
		let entry = this.#find(conversationId);

		if (this.#seenMessages.has(message.messageId)) {
			if (!this.#isActive(conversationId))
				this.invalidateConversation(conversationId);
			return;
		}
		this.#seenMessages.mark(message.messageId);

		if (entry) {
			const isActive = this.#isActive(conversationId);
			if (!isActive && isIncoming) entry.data.unreadCount += 1;
			if (!isActive) this.invalidateConversation(conversationId);
			if (message.timestamp > entry.data.lastActivityTimestamp) {
				this.updatePreview({
					conversationId,
					preview: previewFromMessage(message),
					timestamp: message.timestamp,
				});
			}
		} else {
			if (isIncoming) this.#unreadWhileMissing.add(conversationId);
			entry = await this.#loadMissing(conversationId);
			if (!entry) {
				if (isIncoming) this.#unreadWhileMissing.drop(conversationId);
				this.#seenMessages.unmark(message.messageId);
				return;
			}
			const arrived = this.#unreadWhileMissing.take(conversationId);
			const { data } = entry;
			if (!this.#isActive(conversationId))
				data.unreadCount = Math.max(data.unreadCount, arrived);
		}
		const isInboxPageRoot = page.route.id === "/(protected)/chat";
		const twoColLayout = !singleColumnLayout.current;
		const isConversationsListVisible = isInboxPageRoot || twoColLayout;
		if (
			isIncoming &&
			!this.#isActive(conversationId) &&
			entry &&
			!entry.data.muted &&
			!isConversationsListVisible
		) {
			this.#onIncomingMessage({ message, conversation: entry });
		}
	}

	async #reconcile(): Promise<void> {
		if (this.#destroyed) return;
		if (this.refreshing) {
			this.#refreshRequestedSinceFetchStart = true;
			return;
		}
		this.refreshing = true;
		let reconciled = false;
		try {
			const fetchEpoch = await this.#claimEpochAfterInitial();
			this.#refreshRequestedSinceFetchStart = false;

			this.#messageCache.keepOnly(this.#activeConversationId);

			const oldestLoadedTs = this.entries.reduce(
				(min, e) => Math.min(min, e.data.lastActivityTimestamp),
				Number.POSITIVE_INFINITY,
			);
			const { fetched, oldestFetchedTs, reachedEnd, nextPage } =
				await fetchConversationWindow({
					oldestLoadedTs,
					filters: inboxFilterRequest(this.filters.snapshot()),
				});
			if (this.#fetches.isStale(fetchEpoch)) return;
			this.nextPage = reachedEnd ? null : nextPage;

			this.#rememberedFlags.applyTo(fetched.values());
			for (const incoming of fetched.values()) {
				const existing = this.#find(incoming.data.conversationId);
				if (existing) {
					this.#mergeIncoming({ existing, incoming });
				} else if (
					!this.#pendingDeletes.blocks({
						conversationId: incoming.data.conversationId,
						fetchEpoch,
					})
				) {
					this.entries.push(incoming);
				}
			}

			const windowFloor = reachedEnd
				? Number.NEGATIVE_INFINITY
				: oldestFetchedTs;
			for (const entry of [...this.entries]) {
				const id = entry.data.conversationId;
				if (fetched.has(id)) continue;
				// A filtered refresh only asks the server for what matches, so a
				// cached row that does not match was never a candidate to come
				// back — keep it rather than reading its absence as a delete.
				if (!this.filters.matches(entry)) continue;
				if (
					this.#pendingDeletes.blocks({
						conversationId: id,
						fetchEpoch,
					})
				)
					continue;
				if (entry.data.lastActivityTimestamp > windowFloor) {
					this.remove(id);
				}
			}

			this.#sortEntries();
			this.error = null;
			reconciled = true;
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to refresh conversations",
				error,
				onRetry: () => void this.refresh(),
			});
		} finally {
			this.refreshing = false;
			if (reconciled || this.paging.failure === null) this.paging.rearm();
			this.#runRequestedRefresh();
		}
	}

	#runRequestedRefresh(): void {
		if (!this.#refreshRequestedSinceFetchStart) return;
		this.#refreshRequestedSinceFetchStart = false;
		void this.refresh();
	}

	#syncLatest(args: { errorLabel: string }): Promise<boolean> {
		this.#syncLatestInFlight ??= this.#runSyncLatest(args).finally(() => {
			this.#syncLatestInFlight = null;
		});
		return this.#syncLatestInFlight;
	}

	async #runSyncLatest({
		errorLabel,
	}: {
		errorLabel: string;
	}): Promise<boolean> {
		// Claiming would make an in-flight #load drop the nextPage it fetched.
		const fetchEpoch = this.#fetches.current;
		try {
			const result = await getConversations({
				page: 1,
				filters: inboxFilterRequest(this.filters.snapshot()),
			});
			if (this.#fetches.isStale(fetchEpoch)) return true;
			this.#rememberedFlags.applyTo(result.entries);
			for (const incoming of result.entries) {
				const existing = this.#find(incoming.data.conversationId);
				if (existing) {
					this.#mergeIncoming({ existing, incoming });
				} else if (
					!this.#pendingDeletes.blocks({
						conversationId: incoming.data.conversationId,
						fetchEpoch,
					})
				) {
					this.entries.unshift(incoming);
				}
			}
			this.#sortEntries();
			this.error = null;
			return true;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: errorLabel, error });
			return false;
		}
	}

	async #load(page: number): Promise<void> {
		const fetchEpoch = this.#fetches.claim();
		const result = await getConversations({
			page,
			filters: inboxFilterRequest(this.filters.snapshot()),
		});
		if (this.#fetches.isStale(fetchEpoch)) return;
		this.#rememberedFlags.applyTo(result.entries);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- function-local lookup, never mutated after construction
		const known = new Set(this.entries.map((e) => e.data.conversationId));
		for (const entry of result.entries) {
			const conversationId = entry.data.conversationId;
			if (
				!known.has(conversationId) &&
				!this.#pendingDeletes.blocks({ conversationId, fetchEpoch })
			) {
				this.entries.push(entry);
			}
		}
		this.nextPage = result.nextPage;
		this.#sortEntries();
	}

	async #claimEpochAfterInitial(): Promise<number> {
		await this.#initialLoad.catch(() => {});
		return this.#fetches.claim();
	}

	refresh(): Promise<void> {
		return this.#fetches.track(this.#reconcile());
	}

	retry(): void {
		if (this.#destroyed) return;
		this.entries = [];
		this.nextPage = null;
		this.paging.rearm();
		void this.#hardLoad();
	}

	async #hardLoad(): Promise<void> {
		this.loading = true;
		this.error = null;
		this.#initialLoad = this.#fetches.track(this.#load(1));
		const fetchEpoch = this.#fetches.current;
		try {
			await this.#initialLoad;
		} catch (error) {
			if (this.#destroyed || this.#fetches.isStale(fetchEpoch)) return;
			this.error =
				error instanceof Error ? error : new Error(String(error));
		} finally {
			if (!this.#fetches.isStale(fetchEpoch)) this.loading = false;
		}
	}

	async ensureLoaded(conversationId: string): Promise<boolean> {
		if (this.#find(conversationId)) return true;
		const errorLabel = "Failed to sync conversation into sidebar";
		return this.#fetches.track(this.#syncLatest({ errorLabel }));
	}

	async #loadMissing(id: string): Promise<Conversation | undefined> {
		const joinedRunningSync = this.#syncLatestInFlight !== null;
		const syncSucceeded = await this.ensureLoaded(id);
		const joinedSyncWasTooEarly =
			joinedRunningSync && syncSucceeded && !this.#find(id);
		if (joinedSyncWasTooEarly) await this.ensureLoaded(id);
		return this.#find(id);
	}

	#isActive(conversationId: string): boolean {
		return conversationId === this.#activeConversationId;
	}

	remove(conversationId: string) {
		this.#messageCache.delete(conversationId);
		const index = this.entries.findIndex(
			(e) => e.data.conversationId === conversationId,
		);
		let revert = () => {};
		if (index > -1) {
			const [removed] = this.entries.splice(index, 1);
			revert = () => {
				if (removed && !this.#find(conversationId)) {
					this.entries.splice(
						Math.min(index, this.entries.length),
						0,
						removed,
					);
				}
			};
		}
		return { revert };
	}

	setActive(conversationId: string): void {
		this.#activeConversationId = conversationId;
		void this.markRead(conversationId);
	}

	clearActive(conversationId: string): void {
		if (this.#activeConversationId === conversationId) {
			this.#activeConversationId = null;
		}
	}

	get hasUnread(): boolean {
		return this.inboxViewed.hasUnreadAmong(this.entries);
	}

	noteListViewed(): void {
		// Only what the list actually shows: a filter hiding a busier thread
		// must not mark its activity as seen.
		this.inboxViewed.noteListViewed(this.visibleEntries);
	}

	async markRead(conversationId: string) {
		const entry = this.#find(conversationId);
		if (entry) {
			const clearedCount = entry.data.unreadCount;
			if (clearedCount > 0) {
				entry.data.unreadCount = 0;
				try {
					await markConversationAsRead({ conversationId });
				} catch (error) {
					console.error(error);
					showErrorToast({
						label: "Failed to mark conversation as read",
						error,
					});
					entry.data.unreadCount += clearedCount;
				}
			}
		}
	}

	#setFlag(args: {
		conversationIds: string[];
		field: OptimisticFlagField;
		value: boolean;
		request: (conversationId: string) => Promise<unknown>;
		errorLabel: string;
	}): Promise<void> {
		return setConversationFlag({
			...args,
			find: (id) => this.#find(id),
			pendingFlags: this.#pendingFlags,
			sort: () => this.#sortEntries(),
		});
	}

	setPinned({
		conversationIds,
		pinned,
	}: {
		conversationIds: string[];
		pinned: boolean;
	}): Promise<void> {
		return this.#setFlag({
			conversationIds,
			field: "pinned",
			value: pinned,
			request: (conversationId) =>
				setConversationPinned({ conversationId, pinned }),
			errorLabel: pinned
				? "Failed to pin conversation"
				: "Failed to unpin conversation",
		});
	}

	setMuted({
		conversationIds,
		muted,
	}: {
		conversationIds: string[];
		muted: boolean;
	}): Promise<void> {
		return this.#setFlag({
			conversationIds,
			field: "muted",
			value: muted,
			request: (conversationId) =>
				setConversationMuted({ conversationId, muted }),
			errorLabel: muted
				? "Failed to mute conversation"
				: "Failed to unmute conversation",
		});
	}

	#markServerDeleted(conversationId: string): void {
		this.drafts.forget(conversationId);
		this.#pendingDeletes.mark(conversationId);
		this.#pendingDeletes.settle({
			conversationId,
			fetchEpoch: this.#fetches.current,
		});
		this.#releaseAfterInFlightFetches([conversationId]);
	}

	#releaseAfterInFlightFetches(conversationIds: string[]): void {
		this.#fetches.afterInFlight(() => {
			for (const id of conversationIds) this.#pendingDeletes.release(id);
		});
	}

	async deleteConversations(conversationIds: string[]): Promise<void> {
		for (const id of conversationIds) this.#pendingDeletes.mark(id);
		try {
			const rolledBack = await applyOptimisticBatch({
				items: conversationIds.map((conversationId) => ({
					conversationId,
					revert: this.remove(conversationId).revert,
				})),
				request: async ({ conversationId }) => {
					await deleteConversationForMe({ conversationId });
					this.drafts.forget(conversationId);
				},
				rollback: ({ revert }) => revert(),
				errorLabel: "Failed to delete conversation",
			});
			if (rolledBack) this.#sortEntries();
		} finally {
			for (const id of conversationIds) {
				this.#pendingDeletes.settle({
					conversationId: id,
					fetchEpoch: this.#fetches.current,
				});
			}
			this.#releaseAfterInFlightFetches(conversationIds);
		}
	}

	updatePreview({
		conversationId,
		preview,
		timestamp,
	}: {
		conversationId: Conversation["data"]["conversationId"];
		preview: Conversation["data"]["preview"];
		timestamp: Conversation["data"]["lastActivityTimestamp"];
	}): void {
		const entry = this.#find(conversationId);
		if (!entry) return;
		entry.data.preview = preview;
		entry.data.lastActivityTimestamp = timestamp;
		this.#sortEntries();
	}

	#find(conversationId: string): Conversation | undefined {
		return this.entries.find(
			(e) => e.data.conversationId === conversationId,
		);
	}

	#mergeIncoming({
		existing,
		incoming,
	}: {
		existing: Conversation;
		incoming: Conversation;
	}): void {
		mergeIntoExisting({
			existing,
			incoming,
			pendingFields: this.#pendingFlags.fields(
				incoming.data.conversationId,
			),
			activeConversationId: this.#activeConversationId,
		});
	}

	#sortEntries(): void {
		this.entries = sortConversations(this.entries);
	}

	getCachedConversation(id: string): CachedConversation | undefined {
		return this.#messageCache.get(id);
	}

	setCachedConversation({
		conversationId,
		data,
	}: {
		conversationId: string;
		data: CachedConversation;
	}): void {
		this.#messageCache.set(conversationId, data);
	}

	invalidateConversation(id: string): void {
		this.#messageCache.delete(id);
	}
}

export { ConversationsState };
