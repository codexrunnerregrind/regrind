import { page } from "$app/state";
import { MediaQuery } from "svelte/reactivity";

import { swipeableTabIndex } from "$lib/components/shared/nav-tabs";
import { breakpoints } from "$lib/util/breakpoints.svelte";

const CONVERSATION = "/(protected)/chat/[conversationId]";

let phone: MediaQuery | null = null;

/**
 * Whether the bottom bar's tabs are on show as panes of the tab shell: on a
 * phone, on a tab's own screen, or under a conversation opened from Inbox.
 * While it is, the tabs' own routes render nothing.
 */
export function tabShellShowing(): boolean {
	phone ??= new MediaQuery(`(width < ${breakpoints.split})`);
	if (!phone.current) return false;
	const id = page.route.id;
	return swipeableTabIndex(id) !== -1 || id === CONVERSATION;
}

/** Whether a conversation is open over the shell. */
export function tabShellCovered(): boolean {
	return page.route.id === CONVERSATION;
}

let root = $state<HTMLElement | null>(null);

/** The shell's own box, which the conversation stack slides over. */
export const tabShellRoot = {
	get current(): HTMLElement | null {
		return root;
	},
	set(node: HTMLElement | null): void {
		root = node;
	},
};
