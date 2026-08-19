<script lang="ts">
	import { onMount } from "svelte";

	import { getGeohashSnapshot } from "$lib/app-data/preferences.svelte";
	import GeoMapPicker from "$lib/components/location-chooser/GeoMapPicker.svelte";
	import { decodeGeohash } from "$lib/model/geohash";
	import { draftFromMessage } from "$lib/model/messaging/messages";
	import { hapticImpact } from "$lib/platform/haptics";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	let {
		onClose,
		onSelectionChange,
	}: { onClose: () => void; onSelectionChange: (count: number) => void } =
		$props();

	const composer = getMessageComposerContext();

	let pinPos: { lat: number; lon: number } | undefined = $state();
	let atCurrentLocation = $state(false);
	let geoMapPicker: GeoMapPicker | undefined = $state();

	// Seed the pin with the user's saved location so the map opens somewhere
	// sensible; live GPS (mobile) refines it once permission is granted.
	const savedGeohash = getGeohashSnapshot();
	if (savedGeohash) {
		const { lat, lon } = decodeGeohash(savedGeohash);
		pinPos = { lat, lon };
	}

	onMount(() => {
		if (pinPos) {
			geoMapPicker?.centerAt({
				lat: pinPos.lat,
				lon: pinPos.lon,
				zoom: 15,
			});
		}
		// Auto-select the current position on open (silent: no prompt-denied toast).
		void geoMapPicker?.locate({ silent: true });
	});

	// A dropped pin arms the sheet's send button the way a picked photo does, so
	// the button sits level with the one on the media tab instead of under the
	// map.
	$effect(() => {
		onSelectionChange(pinPos ? 1 : 0);
	});

	export function actionLabel(): string {
		return atCurrentLocation ? "Send current location" : "Send location";
	}

	export function sendSelected() {
		if (!pinPos) return;
		void composer().sendMessages([
			draftFromMessage({
				type: "Location",
				body: { lat: pinPos.lat, lon: pinPos.lon },
			}),
		]);
		hapticImpact("light");
		onClose();
	}
</script>

<div class="flex flex-col gap-3 pt-2">
	<div
		class="h-[50vh] touch-manipulation overflow-clip rounded-lg"
		data-vaul-no-drag
	>
		<GeoMapPicker
			bind:pinPos
			bind:atCurrentLocation
			bind:this={geoMapPicker}
		/>
	</div>
</div>
