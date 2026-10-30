import { reducedMotion } from "$lib/util/reduced-motion";

// A shared-element morph between the Post pill and the sheet it opens. The sheet
// itself does the moving: it is clipped down to the pill's rect and the clip
// grows out to its own edges, so its contents come in through a widening window
// instead of arriving all at once at the end. A veil in the pill's colour sits
// over it for the first half of the trip, so the surface changes colour on its
// way rather than switching at either end.

// Mirrors `before:inset-2` in drawer-content: the visible surface is the panel's
// box inset by this much.
const SURFACE_INSET = 8;

const MORPH_MS = 420;
// vaul's own easing, so the morph and the rest of the drawer read as one motion.
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

// One at a time, and always undone before the next one starts.
let active: {
	panel: HTMLElement;
	animation: Animation;
	veil: HTMLElement;
} | null = null;

/** The sheet's own surface, read off the pseudo-element that draws it. */
function surfaceOf(panel: HTMLElement) {
	const style = getComputedStyle(panel, "::before");
	return {
		radius: Number.parseFloat(style.borderRadius) || 0,
		clip: `inset(${SURFACE_INSET}px round ${Number.parseFloat(style.borderRadius) || 0}px)`,
	};
}

/** The pill's rect as a clip on the panel, which is what the morph starts from. */
function pillClip(panel: HTMLElement, pill: HTMLElement) {
	const box = panel.getBoundingClientRect();
	const rect = pill.getBoundingClientRect();
	const top = rect.top - box.top;
	const right = box.right - rect.right;
	const bottom = box.bottom - rect.bottom;
	const left = rect.left - box.left;
	return `inset(${top}px ${right}px ${bottom}px ${left}px round ${rect.height / 2}px)`;
}

function addVeil(panel: HTMLElement, pill: HTMLElement, radius: number) {
	const veil = document.createElement("div");
	Object.assign(veil.style, {
		position: "absolute",
		inset: `${SURFACE_INSET}px`,
		borderRadius: `${radius}px`,
		background: getComputedStyle(pill).backgroundColor,
		pointerEvents: "none",
	});
	// Last child, so it covers the sheet's contents without a z-index of its own.
	panel.append(veil);
	return veil;
}

/** Dropped mid-flight, the panel is handed back exactly as it was found. */
function reset() {
	if (active === null) return;
	const { panel, animation, veil } = active;
	active = null;
	animation.cancel();
	panel.style.clipPath = "";
	veil.remove();
}

/**
 * True once the drawer has been dragged off its resting place. The clip is in the
 * panel's own coordinates, which a drag's transform has already left behind, so
 * a dragged sheet gets vaul's plain slide instead of a morph that would start in
 * the wrong place.
 */
function isDisplaced(panel: HTMLElement) {
	const transform = getComputedStyle(panel).transform;
	if (transform === "none") return false;
	const matrix = new DOMMatrixReadOnly(transform);
	return Math.abs(matrix.m41) > 0.5 || Math.abs(matrix.m42) > 0.5;
}

/** Grows the sheet out of the pill, which stays hidden until it comes back. */
export function morphOpen(pill: HTMLElement, panel: HTMLElement) {
	reset();
	pill.style.opacity = "0";
	if (reducedMotion.current) return;

	// The morph *is* the entrance; vaul's slide would otherwise run under it. It
	// stays suppressed for as long as the drawer is open — handing it back early
	// replays it from the bottom.
	panel.style.animation = "none";

	const surface = surfaceOf(panel);
	const from = pillClip(panel, pill);
	panel.style.clipPath = from;

	const veil = addVeil(panel, pill, surface.radius);
	const animation = panel.animate(
		[{ clipPath: from }, { clipPath: surface.clip }],
		{ duration: MORPH_MS, easing: EASE, fill: "both" },
	);
	active = { panel, animation, veil };

	// Held at full strength while the window is still small, then out of the way
	// well before the clip lands.
	veil.animate([{ opacity: 1 }, { opacity: 0 }], {
		duration: MORPH_MS * 0.5,
		delay: MORPH_MS * 0.3,
		fill: "forwards",
	});

	void animation.finished
		.then(() => {
			// Cleared rather than left filling: the clip would otherwise keep
			// cutting the surface's shadow off for as long as the sheet is up.
			if (active?.animation === animation) reset();
		})
		.catch(() => {});
}

/** The way back: the sheet shrinks into the pill and hands the screen over. */
export function morphClose(pill: HTMLElement, panel: HTMLElement) {
	reset();

	if (reducedMotion.current || isDisplaced(panel)) {
		// vaul owns the exit, and bits-ui waits on its animation to unmount.
		panel.style.animation = "";
		pill.style.opacity = "";
		return;
	}

	panel.style.animation = "none";
	const surface = surfaceOf(panel);
	const to = pillClip(panel, pill);
	panel.style.clipPath = surface.clip;

	const veil = addVeil(panel, pill, surface.radius);
	veil.style.opacity = "0";

	// bits-ui waits on the panel's own animations before it unmounts, so this one
	// holds the sheet on screen for as long as it takes to shrink.
	const animation = panel.animate(
		[{ clipPath: surface.clip }, { clipPath: to }],
		{ duration: MORPH_MS, easing: EASE, fill: "both" },
	);
	active = { panel, animation, veil };

	veil.animate([{ opacity: 0 }, { opacity: 1 }], {
		duration: MORPH_MS * 0.45,
		fill: "forwards",
	});

	// Back before the shrink ends, while the veil still covers it: waiting for the
	// panel to go leaves a frame with neither the sheet nor the pill in it.
	const restore = window.setTimeout(() => {
		pill.style.opacity = "";
	}, MORPH_MS * 0.8);

	void animation.finished
		.then(() => {
			if (active?.animation === animation) active = null;
			veil.remove();
		})
		.catch(() => {
			window.clearTimeout(restore);
			pill.style.opacity = "";
		});
}
