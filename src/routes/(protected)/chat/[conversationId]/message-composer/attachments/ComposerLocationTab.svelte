<script lang="ts">
	import {
		checkPermissions,
		getCurrentPosition,
		requestPermissions,
	} from "@tauri-apps/plugin-geolocation";
	import { platform } from "@tauri-apps/plugin-os";
	import { CrosshairIcon, MapTrifoldIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import { getGeohashSnapshot } from "$lib/app-data/preferences.svelte";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "$lib/components/ui/button";
	import Spinner from "$lib/components/ui/spinner/spinner.svelte";
	import { decodeGeohash } from "$lib/model/geohash";
	import { hapticImpact } from "$lib/platform/haptics";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	let {
		onClose,
	}: {
		onClose: () => void;
	} = $props();

	const composer = getMessageComposerContext();

	let gpsAvailable = $state(false);
	try {
		gpsAvailable = ["android", "ios"].includes(platform());
	} catch {
		gpsAvailable = false;
	}

	let locatingInProgress = $state(false);
	let pickerOpen = $state(false);
	let pinPos: { lat: number; lon: number; zoom: number } | undefined = $state();
	let locationChooser: LocationChooser | undefined = $state();

	function sendLocation(lat: number, lon: number) {
		void composer().sendMessage({ type: "Location", body: { lat, lon } });
		hapticImpact("light");
		onClose();
	}

	async function shareCurrentLocation() {
		if (locatingInProgress) return;
		locatingInProgress = true;
		try {
			let permissions = await checkPermissions();
			if (
				permissions.location === "prompt" ||
				permissions.location === "prompt-with-rationale"
			) {
				permissions = await requestPermissions(["location"]);
			}
			if (permissions.location !== "granted") {
				toast.error(
					"Location permission denied. Change this in your system settings to share your location.",
				);
				return;
			}
			const pos = await getCurrentPosition();
			sendLocation(pos.coords.latitude, pos.coords.longitude);
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to get current location", error });
		} finally {
			locatingInProgress = false;
		}
	}

	function openPicker() {
		const geohash = getGeohashSnapshot();
		pinPos = geohash ? { ...decodeGeohash(geohash), zoom: 15 } : undefined;
		pickerOpen = true;
		if (pinPos) locationChooser?.centerAt(pinPos);
	}

	function onPickerSubmit(geohash: string) {
		const { lat, lon } = decodeGeohash(geohash);
		sendLocation(lat, lon);
	}
</script>

<div class="flex flex-col gap-3 py-8">
	{#if gpsAvailable}
		<Button
			size="lg"
			class="w-full justify-start gap-3"
			disabled={locatingInProgress}
			onclick={shareCurrentLocation}
		>
			{#if locatingInProgress}
				<Spinner class="size-5" />
			{:else}
				<CrosshairIcon weight="fill" class="size-5" />
			{/if}
			Share my current location
		</Button>
	{/if}
	<Button
		size="lg"
		variant={gpsAvailable ? "secondary" : "default"}
		class="w-full justify-start gap-3"
		onclick={openPicker}
	>
		<MapTrifoldIcon weight="fill" class="size-5" />
		Pick a location on the map
	</Button>
</div>

<LocationChooser
	onSubmit={onPickerSubmit}
	bind:open={pickerOpen}
	bind:this={locationChooser}
	bind:pinPos
/>
