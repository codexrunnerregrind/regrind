import { tick } from "svelte";

export function fixedHeaderOffset({
	container,
	enabled,
}: {
	container: () => HTMLElement | null | undefined;
	enabled: () => boolean;
}): { readonly px: number } {
	let px = $state(0);

	$effect(() => {
		const el = container();
		if (!enabled() || !el) return;
		// Only headers over this container count: a pager keeps its other
		// panes, and their headers, mounted beside it.
		const measure = () => {
			const box = el.getBoundingClientRect();
			let bottom = box.top;
			for (const header of document.querySelectorAll(
				"[data-fixed-header]",
			)) {
				if (header.closest("[data-leaving], [data-covered]")) continue;
				const rect = header.getBoundingClientRect();
				if (rect.right > box.left && rect.left < box.right)
					bottom = Math.max(bottom, rect.bottom);
			}
			px = bottom - box.top;
		};
		void tick().then(measure);
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	});

	return {
		get px() {
			return px;
		},
	};
}
