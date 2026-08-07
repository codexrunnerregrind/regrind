import { accountScoped } from "$lib/api/account-caches";
import { showProfileViewToast } from "$lib/components/profile-view-toast/profile-view-toast-manager";
import { viewedMeV1NewViewReceivedEventSchema, ws } from "$lib/ws.svelte";

export type NewProfileView = {
	profileId: number;
	photoHash: string | null;
	timestamp: number;
};

/**
 * Tracks profile views that arrived over the realtime socket but haven't been
 * looked at yet, so the nav bar can badge the Interest tab.
 *
 * Deliberately *not* persisted: the signal comes from the socket, which only
 * runs while the app does, so a badge restored from storage could never be
 * reconciled against what the server thinks is new. The badge lives for the
 * session and is cleared the moment the Interest tab is opened.
 *
 * Separate from {@link ViewsState}: that one only exists while the Views grid is
 * mounted, and the badge has to work from anywhere in the app.
 */
export class ViewActivityState {
	#hasUnseenViews = $state(false);
	#onNewView: (view: NewProfileView) => void;
	#unlisten: Promise<() => void>;

	constructor({ onNewView }: { onNewView: (view: NewProfileView) => void }) {
		this.#onNewView = onNewView;
		this.#unlisten = ws
			.on(
				"viewed_me.v1.new_view_received",
				viewedMeV1NewViewReceivedEventSchema,
				(event) => {
					const recent = event.payload.mostRecent;
					if (!recent) return;
					this.#hasUnseenViews = true;
					this.#onNewView({
						profileId: recent.profileId,
						photoHash: recent.photoHash ?? null,
						timestamp: recent.timestamp,
					});
				},
			)
			// Registration rejects when the Tauri runtime is absent (a plain
			// browser, tests); degrade to no badge rather than an unhandled
			// rejection.
			.catch((error: unknown) => {
				console.error("[views] listener registration failed", error);
				return () => {};
			});
	}

	get hasUnseenViews(): boolean {
		return this.#hasUnseenViews;
	}

	markSeen(): void {
		this.#hasUnseenViews = false;
	}

	destroy(): void {
		void this.#unlisten.then((unlisten) => {
			unlisten();
		});
	}
}

export const getViewActivityState = accountScoped(
	() => new ViewActivityState({ onNewView: showProfileViewToast }),
);
