// MapLibre's CSP build is the same API as the default entry, but ships its
// worker as a separate file instead of a `blob:` URL. It carries no types of
// its own; loadMapLibre() casts it to the typed entry's shape.
declare module "maplibre-gl/dist/maplibre-gl-csp.js";

declare module "maplibre-gl/dist/maplibre-gl-csp-worker.js?url" {
	const url: string;
	export default url;
}
