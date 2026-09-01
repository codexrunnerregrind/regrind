import type * as MapLibre from "maplibre-gl";

/**
 * The MapLibre module and its map, aliased here so every consumer names the
 * same type — resolving `typeof import("maplibre-gl")` separately per file
 * yields types the checker treats as unrelated.
 */
export type MapLibreModule = typeof MapLibre;
export type MapLibreMap = MapLibre.Map;

// CARTO's key-less vector basemaps: sharp at any zoom and available in both a
// light and a dark variant, unlike the raster OSM tiles this replaced.
const STYLE_LIGHT =
	"https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const STYLE_DARK =
	"https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export function basemapStyleUrl(dark: boolean): string {
	return dark ? STYLE_DARK : STYLE_LIGHT;
}

let libraryPromise: Promise<MapLibreModule> | undefined;

/**
 * Loads MapLibre on first use. Uses the CSP build plus a real worker file
 * rather than the default bundle, which spawns its worker from a `blob:` URL
 * the app's CSP does not allow.
 */
export function loadMapLibre(): Promise<MapLibreModule> {
	libraryPromise ??= (async () => {
		const [module, workerUrl] = await Promise.all([
			import("maplibre-gl/dist/maplibre-gl-csp.js"),
			import("maplibre-gl/dist/maplibre-gl-csp-worker.js?url"),
			import("maplibre-gl/dist/maplibre-gl.css"),
		]);
		const library = module as MapLibreModule;
		library.setWorkerUrl(workerUrl.default);
		return library;
	})();
	return libraryPromise;
}

/**
 * Re-tints dark-matter, which is near-monochrome black out of the box and
 * leaves roads barely visible. Best-effort: a schema change upstream just
 * leaves the style as-is.
 */
function tintDarkStyle(map: MapLibreMap): void {
	const LAND = "#1b2e33";
	const PARK = "#163328";
	const WATER = "#0d1f30";
	const ROAD_CASE = "#0f1d20";
	const ROAD_FILL = "#5c6f74";
	const ROAD_MINOR = "#445256";
	const RAIL = "#62737a";
	const RAIL_DASH = "#4a565a";

	for (const layer of map.getStyle()?.layers ?? []) {
		const id = layer.id;
		try {
			if (layer.type === "background") {
				map.setPaintProperty(id, "background-color", LAND);
			} else if (layer.type === "fill") {
				if (id.startsWith("park")) {
					map.setPaintProperty(id, "fill-color", PARK);
				} else if (id === "landcover" || id === "landuse") {
					map.setPaintProperty(id, "fill-color", LAND);
				} else if (/water/i.test(id)) {
					map.setPaintProperty(id, "fill-color", WATER);
				}
			} else if (
				layer.type === "line" &&
				layer["source-layer"] === "transportation"
			) {
				if (/rail/.test(id)) {
					map.setPaintProperty(
						id,
						"line-color",
						/dash/.test(id) ? RAIL_DASH : RAIL,
					);
				} else if (/case/.test(id)) {
					map.setPaintProperty(id, "line-color", ROAD_CASE);
				} else if (/service|path/.test(id)) {
					map.setPaintProperty(id, "line-color", ROAD_MINOR);
				} else {
					map.setPaintProperty(id, "line-color", ROAD_FILL);
				}
			}
		} catch {
			// skip this layer, keep theming the rest
		}
	}
}

/**
 * Brings street names and house numbers forward a couple of zoom levels.
 * CARTO holds minor-road labels back to z16 and house numbers to z17, which is
 * past the point where they help place a pin.
 */
function relaxLabelZooms(map: MapLibreMap): void {
	for (const layer of map.getStyle()?.layers ?? []) {
		if (layer.type !== "symbol") continue;
		try {
			if (layer.id.startsWith("roadname_") && layer.minzoom) {
				map.setLayerZoomRange(
					layer.id,
					Math.max(0, layer.minzoom - 2),
					layer.maxzoom ?? 24,
				);
			} else if (layer.id === "housenumber") {
				// z14 is where the source data itself stops; anything past that
				// is the same tile overzoomed. The style's text-size ramp starts
				// at z17, so it clamps to a 9px minimum below that — set a
				// legible fixed size along with the range.
				map.setLayerZoomRange(layer.id, 14, layer.maxzoom ?? 24);
				map.setLayoutProperty(layer.id, "text-size", 11);
			}
		} catch {
			// skip this layer, keep relaxing the rest
		}
	}
}

/** Applies the app's own tweaks to a freshly (re)loaded basemap style. */
export function decorateStyle(map: MapLibreMap, dark: boolean): void {
	relaxLabelZooms(map);
	if (dark) tintDarkStyle(map);
}

/** The dropped-pin marker, sized for the picker (40px) or a preview (36px). */
export function pinElement(size = 40): HTMLElement {
	const element = document.createElement("div");
	element.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="${size}" height="${size}" fill="#ffba20" stroke="#000000" stroke-width="8px" viewBox="0 0 256 256"><path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z"></path></svg>`;
	return element;
}
