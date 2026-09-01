<script lang="ts">
	import { untrack } from "svelte";
	import type { MapOptions } from "maplibre-gl";

	import { isDarkTheme } from "$lib/app-data/theme.svelte";
	import {
		basemapStyleUrl,
		decorateStyle,
		loadMapLibre,
		type MapLibreMap,
		type MapLibreModule,
	} from "./basemap";

	let {
		options,
		instance = $bindable(),
		// eslint-disable-next-line no-useless-assignment -- $bindable() default
		library = $bindable(),
		class: className,
	}: {
		// Passed straight to the MapLibre constructor, minus `container` and
		// `style` which this component owns. Read once, at creation.
		options: Omit<MapOptions, "container" | "style">;
		// The live map, once it exists. Callers wire their own handlers and
		// markers onto it from an $effect that waits for it.
		instance?: MapLibreMap;
		// The module itself, for callers that need its constructors (Marker,
		// controls) without importing — and so paying for — it up front.
		library?: MapLibreModule;
		class?: string;
	} = $props();

	let container: HTMLDivElement | null = $state(null);
	let appliedStyle: string | undefined;

	// Creation is one-shot: theme changes swap the style below rather than
	// rebuilding the map, so neither it nor `options` is read reactively here.
	$effect(() => {
		if (!container) return;
		let map: MapLibreMap | undefined;
		let disposed = false;
		const style = basemapStyleUrl(untrack(isDarkTheme));
		appliedStyle = style;
		void loadMapLibre().then((maplibre) => {
			if (disposed || !container) return;
			map = new maplibre.Map({
				...untrack(() => options),
				container,
				style,
			});
			// Fires on the initial load and again after every setStyle().
			map.on("style.load", () => {
				if (map) decorateStyle(map, isDarkTheme());
			});
			// A compact attribution unfolds itself every time its text changes
			// — on the first style load, and again on each theme swap — and
			// only folds away once the map is moved, covering the controls
			// until then. Fold it back; its ⓘ button still opens it.
			map.on("styledata", () => {
				map?.getContainer()
					.querySelector(".maplibregl-ctrl-attrib")
					?.classList.remove("maplibregl-compact-show");
			});
			library = maplibre;
			instance = map;
		});
		return () => {
			disposed = true;
			map?.remove();
			instance = undefined;
		};
	});

	$effect(() => {
		const map = instance;
		const style = basemapStyleUrl(isDarkTheme());
		// Before the map exists the creation effect owns the choice; re-running
		// once `instance` lands catches a flip that happened while it loaded.
		if (!map || style === appliedStyle) return;
		appliedStyle = style;
		map.setStyle(style);
	});

	// MapLibre measures its container once, at creation. Inside an animating
	// drawer or a chat bubble that grows a tail, that size is already stale by
	// the time it paints, leaving a blank or clipped canvas.
	$effect(() => {
		const map = instance;
		if (!map || !container) return;
		const observer = new ResizeObserver(() => map.resize());
		observer.observe(container);
		return () => observer.disconnect();
	});
</script>

<div bind:this={container} class={className}></div>
