// A mouse wheel only scrolls vertically, which leaves sideways rows
// (`data-scroll-intent="x"`) out of reach without a trackpad.
export function installSidewaysWheel(): () => void {
	const onWheel = (event: WheelEvent) => {
		if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX))
			return;
		const row = (event.target as Element | null)?.closest<HTMLElement>(
			'[data-scroll-intent="x"]',
		);
		if (!row) return;
		const max = row.scrollWidth - row.clientWidth;
		const next = Math.min(max, Math.max(0, row.scrollLeft + event.deltaY));
		if (next === row.scrollLeft) return;
		event.preventDefault();
		row.scrollLeft = next;
	};
	window.addEventListener("wheel", onWheel, { passive: false });
	return () => window.removeEventListener("wheel", onWheel);
}
