import { videoCall } from "$lib/video-call/call-state.svelte";
import { getConversationState } from "../../conversation-state.svelte";

/**
 * The official app pairs the two video actions in the media sheet — record
 * one, or place a call — so the call sits beside "Add video" rather than only
 * behind the conversation menu.
 */
export class ComposerCall {
	#conversationState = $derived(getConversationState()());
	readonly blockedReason = $derived(videoCall.blockedReason);
	// The allowance is account-wide and already in hand, so saying what is left
	// of it costs no request — and a call is worth starting knowing how long it
	// can run, since the server cuts it off when the time is spent.
	readonly timeLeft = $derived(videoCall.timeLeftLabel);
	#onClose: () => void;

	constructor(onClose: () => void) {
		this.#onClose = onClose;
	}

	start() {
		const profile = this.#conversationState.profile;
		if (this.blockedReason !== null || !profile) return;
		// The call takes the whole screen, so the sheet has no business staying
		// open underneath it.
		this.#onClose();
		void videoCall.call({
			profileId: profile.profileId,
			name: profile.name ?? null,
			mediaHash: profile.mediaHash ?? null,
		});
	}
}
