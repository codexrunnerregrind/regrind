import { on } from "svelte/events";
import type { Attachment } from "svelte/attachments";

import { isMobilePlatform } from "#lib/platform/os.ts";

/**
 * A `dblclick` listener for desktop only. On touch, any dblclick listener above
 * a tap has WebKit hold the tap ~350ms for a second one; double-taps there are
 * synthesized from touches instead (see `longPressHandlers`).
 */
export function mouseDoubleClick(
	handler: (event: MouseEvent) => void,
): Attachment<HTMLElement> {
	return (node) =>
		isMobilePlatform() ? undefined : on(node, "dblclick", handler);
}
