import { on } from "svelte/events";
import type { Attachment } from "svelte/attachments";

import { isIosPlatform } from "#lib/platform/os.ts";
import { firedByTouch } from "#lib/platform/touch-origin.ts";

/**
 * A `dblclick` listener for mouse and trackpad. Touch double-taps are
 * synthesized by `longPressHandlers`, so a touch's dblclick is ignored. Not
 * attached on iOS, where any dblclick listener above a tap has WebKit hold the
 * tap ~350ms for a second one.
 */
export function mouseDoubleClick(
	handler: (event: MouseEvent) => void,
): Attachment<HTMLElement> {
	return (node) =>
		isIosPlatform()
			? undefined
			: on(node, "dblclick", (event) => {
					if (!firedByTouch(event)) handler(event);
				});
}
