/**
 * A chat bubble is `width: fit-content` under a max-width, so the moment its
 * text wraps the box resolves to the cap and keeps whatever slack the lines
 * leave over. No CSS shrinks it back, so the widest line is measured and pinned
 * as an explicit width.
 *
 * Work is batched across every bubble queued in the same frame: one pass drops
 * the pinned widths, one reads, one writes. Two reflows for a whole page of
 * messages instead of two per bubble.
 */

export type Bubble = {
	/** The bubble itself — the box whose width gets pinned. */
	box: HTMLElement;
	/** The element holding the text, whose line boxes are measured. */
	text: HTMLElement;
};

type Rect = { top: number; bottom: number; left: number; right: number };

/**
 * The widest line among `rects`, or 0 when the text takes a single line and
 * already hugs it. Font fallback (an emoji) splits one line into several rects,
 * so rects are grouped onto lines by their vertical centre before measuring.
 */
export function widestLine(rects: readonly Rect[], tolerance: number): number {
	const lines: { centre: number; left: number; right: number }[] = [];
	for (const rect of rects) {
		if (rect.right <= rect.left) continue;
		const centre = (rect.top + rect.bottom) / 2;
		const line = lines.find(
			(each) => Math.abs(each.centre - centre) < tolerance,
		);
		if (line === undefined) {
			lines.push({ centre, left: rect.left, right: rect.right });
			continue;
		}
		line.left = Math.min(line.left, rect.left);
		line.right = Math.max(line.right, rect.right);
	}
	if (lines.length < 2) return 0;
	return Math.max(...lines.map((line) => line.right - line.left));
}

/**
 * How narrow the box may go regardless of its text: a reply quote carries a
 * load-bearing min-width, and pinning under it would overflow the bubble.
 */
function floorWidth(bubble: Bubble): number {
	let floor = 0;
	for (const child of bubble.box.children) {
		if (child === bubble.text) continue;
		const style = getComputedStyle(child);
		if (style.position === "absolute") continue;
		floor = Math.max(floor, parseFloat(style.minWidth) || 0);
	}
	return floor;
}

function measure(bubble: Bubble): number | null {
	const range = document.createRange();
	range.selectNodeContents(bubble.text);
	const style = getComputedStyle(bubble.box);
	const lineHeight = parseFloat(getComputedStyle(bubble.text).lineHeight);
	const widest = widestLine(
		[...range.getClientRects()],
		Number.isFinite(lineHeight) ? lineHeight / 2 : 1,
	);
	if (widest === 0) return null;
	const content = Math.max(widest, floorWidth(bubble));
	// `width` is the border box under Tailwind's `box-sizing: border-box`.
	const padding =
		style.boxSizing === "border-box"
			? parseFloat(style.paddingLeft) +
				parseFloat(style.paddingRight) +
				parseFloat(style.borderLeftWidth) +
				parseFloat(style.borderRightWidth)
			: 0;
	// Rounding up keeps the pinned width at or above the line it was measured
	// from, so the text cannot rewrap into an extra line.
	return Math.ceil(content + padding);
}

const live = new Set<Bubble>();
const queued = new Set<Bubble>();
let frame: number | null = null;
let listening = false;

function flush() {
	frame = null;
	const bubbles = [...queued];
	queued.clear();
	for (const bubble of bubbles) bubble.box.style.width = "";
	const widths = bubbles.map(measure);
	bubbles.forEach((bubble, index) => {
		const width = widths[index];
		if (width !== null && width !== undefined)
			bubble.box.style.width = `${width}px`;
	});
}

function queue(bubble: Bubble) {
	queued.add(bubble);
	frame ??= requestAnimationFrame(flush);
}

function refitAll() {
	for (const bubble of live) queue(bubble);
}

let lastWidth = 0;

// The soft keyboard resizes the window on iOS without changing how the text
// wraps, so only a width change is worth remeasuring for.
function onResize() {
	if (window.innerWidth === lastWidth) return;
	lastWidth = window.innerWidth;
	refitAll();
}

/**
 * Pin `bubble` to its widest line, and keep it pinned across the events that
 * change where the text wraps. Returns a teardown.
 */
export function fitToLines(bubble: Bubble): () => void {
	live.add(bubble);
	queue(bubble);
	if (!listening) {
		listening = true;
		lastWidth = window.innerWidth;
		window.addEventListener("resize", onResize);
		// A late webfont remeasures every bubble laid out with the fallback.
		// Optional: jsdom, and older WebKit, ship no font-loading API.
		document.fonts?.ready.then(refitAll).catch(() => {});
	}
	return () => {
		live.delete(bubble);
		queued.delete(bubble);
		bubble.box.style.width = "";
	};
}
