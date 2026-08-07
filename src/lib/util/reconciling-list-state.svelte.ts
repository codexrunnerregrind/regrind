import { showErrorToast } from "$lib/api/error-toast";
import { reconciler } from "$lib/util/reconcile";

export abstract class ReconcilingListState<TItem, TSnapshot, TKey = number> {
	loading = $state(true);
	refreshing = $state(false);
	error: Error | null = $state(null);
	visibleCount = $state(0);
	scrollY = 0;

	readonly #pageSize: number;
	readonly #refreshErrorLabel: string;
	#loaded = false;
	#destroyed = false;
	#unsubscribeReconcile: (() => void) | null = null;
	#unlisten: Promise<() => void> | null = null;
	#buffer: TItem[] | null = null;
	#fetchToken = 0;
	#refreshRequestedSinceFetchStart = false;

	constructor({
		pageSize,
		refreshErrorLabel,
	}: {
		pageSize: number;
		refreshErrorLabel: string;
	}) {
		this.#pageSize = pageSize;
		this.#refreshErrorLabel = refreshErrorLabel;
		this.visibleCount = pageSize;
	}

	// A subclass calls this last: its fields exist only after super() returns.
	protected start(): void {
		const cached = this.loadCache();
		if (cached === null) {
			void this.#hardLoad();
		} else {
			// Seeded from a previous visit: show it at once and catch up quietly,
			// instead of replacing what we already have with skeletons.
			this.applySnapshot(cached);
			this.loading = false;
			void this.#backgroundRefresh();
		}
		this.#unsubscribeReconcile = reconciler.subscribe(() => this.refresh());
		this.#unlisten = this.subscribeEvents();
	}

	get hasMore(): boolean {
		return this.visibleCount < this.length;
	}

	loadMore(): void {
		if (!this.hasMore) return;
		this.visibleCount += this.#pageSize;
	}

	load(): void {
		if (this.#loaded || this.loading || this.refreshing) return;
		this.retry();
	}

	retry(): void {
		void this.#hardLoad();
	}

	async refresh(): Promise<void> {
		if (this.#destroyed) return;
		if (this.refreshing || this.loading) {
			this.#refreshRequestedSinceFetchStart = true;
			return;
		}
		this.refreshing = true;
		try {
			await this.#replaceFromServer();
		} catch (error) {
			console.error(error);
			showErrorToast({ label: this.#refreshErrorLabel, error });
		} finally {
			this.refreshing = false;
			this.#runRequestedRefresh();
		}
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#unsubscribeReconcile?.();
		this.#unlisten?.then((unlisten) => unlisten()).catch(console.error);
	}

	protected upsert(item: TItem): void {
		if (this.#destroyed) return;
		this.#buffer?.push(item);
		this.applyUpsert(item);
	}

	// Refreshes seeded data without touching loading/refreshing, so a revisit
	// updates in place with no skeleton and no refresh indicator. Goes through
	// the same guarded path as any other fetch, so a reconcile or an event
	// arriving mid-flight is not lost.
	async #backgroundRefresh(): Promise<void> {
		try {
			await this.#replaceFromServer();
		} catch {
			// Keep showing the seeded data on failure.
		} finally {
			this.#runRequestedRefresh();
		}
	}

	async #hardLoad(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			await this.#replaceFromServer();
		} catch (error) {
			this.error =
				error instanceof Error ? error : new Error(String(error));
		} finally {
			this.loading = false;
			this.#runRequestedRefresh();
		}
	}

	#runRequestedRefresh(): void {
		if (!this.#refreshRequestedSinceFetchStart) return;
		this.#refreshRequestedSinceFetchStart = false;
		void this.refresh();
	}

	async #replaceFromServer(): Promise<void> {
		if (this.#destroyed) return;
		const token = ++this.#fetchToken;
		this.#refreshRequestedSinceFetchStart = false;
		const buffer: TItem[] = [];
		this.#buffer = buffer;
		try {
			const snapshot = await this.fetch();
			if (this.#superseded(token)) return;
			const covered = this.applySnapshotReturningCoveredKeys(snapshot);
			for (const item of buffer) {
				if (!covered.has(this.keyOf(item))) this.applyUpsert(item);
			}
			this.#loaded = true;
			this.error = null;
		} catch (error) {
			if (this.#superseded(token)) return;
			throw error;
		} finally {
			if (this.#buffer === buffer) this.#buffer = null;
		}
	}

	#superseded(token: number): boolean {
		return this.#destroyed || token !== this.#fetchToken;
	}

	// Subclasses that persist a snapshot across navigations return it here to
	// render immediately (and refresh silently) instead of showing skeletons.
	protected loadCache(): TSnapshot | null {
		return null;
	}

	protected abstract get length(): number;
	protected abstract fetch(): Promise<TSnapshot>;
	protected abstract applySnapshotReturningCoveredKeys(
		snapshot: TSnapshot,
	): Set<TKey>;
	protected abstract applyUpsert(item: TItem): void;
	protected abstract keyOf(item: TItem): TKey;
	protected abstract subscribeEvents(): Promise<() => void>;
}
