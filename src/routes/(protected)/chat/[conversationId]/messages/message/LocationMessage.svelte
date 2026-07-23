<script lang="ts">
	import { platform } from "@tauri-apps/plugin-os";
	import { divIcon } from "leaflet";
	import { Map, Marker, TileLayer } from "sveaflet";
	import type { Map as LeafletMap } from "leaflet";

	import type { LocationMessage } from "$lib/model/messaging/messages";
	import { MessageMediaState } from "./message-media.svelte";

	let {
		message,
	}: {
		message: LocationMessage["body"];
	} = $props();

	const media = new MessageMediaState();

	let map: LeafletMap | undefined = $state();

	// Keep the preview centred on the shared point even if the container is
	// resized (e.g. the bubble grows a tail once it becomes last in stack).
	$effect(() => {
		map?.setView([message.lat, message.lon], 15);
	});

	// Deep-link into the native Google Maps app where possible, only falling back
	// to a web URL (browser) on desktop where no maps app scheme exists.
	function mapsUrl(): string {
		const { lat, lon } = message;
		let os = "";
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
	class={["relative", { "w-3/5 min-w-45 max-w-72 ms-3": !media.clone }]}
	bind:this={media.el}
>
	<button
		type="button"
		aria-label="Open location in maps"
		class={[
			"block aspect-video w-full cursor-pointer overflow-clip rounded-lg bg-card-foreground/10",
			media.cornerClass,
		]}
		onclick={openInMaps}
	>
		<!-- Non-interactive preview: taps open the location externally instead. -->
		<div class="pointer-events-none size-full">
			<Map
				options={{
					center: [message.lat, message.lon],
					zoom: 15,
					attributionControl: false,
					zoomControl: false,
					dragging: false,
					touchZoom: false,
					scrollWheelZoom: false,
					doubleClickZoom: false,
					boxZoom: false,
					keyboard: false,
				}}
				bind:instance={map}
			>
				<TileLayer
					url={"https://tile.openstreetmap.org/{z}/{x}/{y}.png"}
					options={{ maxZoom: 19 }}
				/>
				<Marker
					latLng={[message.lat, message.lon]}
					options={{
						interactive: false,
						keyboard: false,
						icon: divIcon({
							html: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="#ffba20" stroke="#000000" stroke-width="8px" viewBox="0 0 256 256"><path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z"></path></svg>',
							iconAnchor: [18, 36],
							iconSize: [36, 36],
							className: "",
						}),
					}}
				/>
			</Map>
		</div>
	</button>
	{@render media.adornments?.()}
</div>
