import { reducedMotion } from "$lib/util/reduced-motion";

export const SPRING = "cubic-bezier(0.34, 1.32, 0.64, 1)";

/** Attachment: a chat line rising into place, staggered by `index`. */
export function enter(index: number) {
	return (node: HTMLElement) => {
		if (reducedMotion.current) return;
		node.animate?.(
			[
				{ opacity: 0, transform: "translateY(10px) scale(0.96)" },
				{ opacity: 1, transform: "none" },
			],
			{ duration: 320, delay: index * 40, easing: SPRING, fill: "both" },
		);
	};
}

export function bounce(node: HTMLElement | null): void {
	if (reducedMotion.current) return;
	node?.animate?.(
		[
			{ transform: "scale(1)" },
			{ transform: "scale(1.45) rotate(-14deg)" },
			{ transform: "scale(0.9) rotate(6deg)" },
			{ transform: "scale(1)" },
		],
		{ duration: 480, easing: "ease-out" },
	);
}

export async function settled(
	animations: (Animation | undefined)[],
): Promise<void> {
	await Promise.all(
		animations
			.filter((animation) => animation !== undefined)
			.map((animation) => animation.finished.catch(() => undefined)),
	);
}
