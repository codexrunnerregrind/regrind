<script lang="ts">
	import { platform } from "@tauri-apps/plugin-os";

	import {
		type MapLibreMap,
		type MapLibreModule,
		pinElement,
	} from "$lib/components/map/basemap";
	import MapView from "$lib/components/map/MapView.svelte";
	import type { LocationMessage } from "$lib/model/messaging/messages";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: LocationMessage["body"] } = $props();

	const media = new MessageMediaState();

	let map: MapLibreMap | undefined = $state();
	let maplibre: MapLibreModule | undefined = $state();

	$effect(() => {
		if (!map || !maplibre) return;
		const marker = new maplibre.Marker({
			element: pinElement(36),
			anchor: "bottom",
		})
			.setLngLat([message.lon, message.lat])
			.addTo(map);
		// Keep the preview centered on the shared point even if the container is
		// resized (e.g. the bubble grows a tail once it becomes last in stack).
		map.jumpTo({ center: [message.lon, message.lat], zoom: 15 });
		return () => marker.remove();
	});

	// Deep-link into the native Google Maps app where possible, only falling back
	// to a web URL (browser) on desktop where no maps app scheme exists.
	function mapsUrl(): string {
		const { lat, lon } = message;
		let os: string;
		try {
			os = platform();
		} catch {
			os = "";
		}
		if (os === "ios") {
			return `comgooglemaps://?q=${lat},${lon}&center=${lat},${lon}&zoom=16`;
		}
		if (os === "android") {
			return `geo:${lat},${lon}?q=${lat},${lon}`;
		}
		return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
	}

	function openInMaps() {
		void import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
			openUrl(mapsUrl()),
		);
	}
</script>

<div
	class={["relative", { "w-1/2 max-w-56 min-w-40": !media.clone }]}
	{@attach media.attach}
>
	<button
		type="button"
		aria-label="Open location in maps"
		class={[
			"chat-media-tint block aspect-square w-full cursor-pointer overflow-clip rounded-lg",
			media.cornerClass,
		]}
		onclick={openInMaps}
	>
		<!-- Non-interactive preview: taps open the location externally instead. -->
		<MapView
			class="pointer-events-none size-full"
			options={{
				center: [message.lon, message.lat],
				zoom: 15,
				interactive: false,
				attributionControl: false,
			}}
			bind:instance={map}
			bind:library={maplibre}
		/>
	</button>
	{@render media.adornments?.()}
</div>
