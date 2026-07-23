<script lang="ts">
	import { CheckIcon, GpsFixIcon, MapPinIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import {
		geoApiSupported,
		LocationPermissionDeniedError,
		switchToCurrentLocation,
	} from "$lib/app-data/location";
	import {
		getCurrentGeohashSnapshot,
		getGeohashSnapshot,
		getUsingCurrentLocationSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { decodeGeohash } from "$lib/model/geohash";

	let {
		class: className,
	}: {
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const usingCurrent = $derived(getUsingCurrentLocationSnapshot());
	const geoSupported = geoApiSupported();

	let menuOpen = $state(false);
	let pickerOpen = $state(false);
	let pinPos: { lat: number; lon: number; zoom: number } | undefined = $state();
	let locationChooser: LocationChooser | undefined = $state();
	let locating = $state(false);

	async function useCurrentLocation() {
		// Dismiss the menu immediately; detection continues in the background.
		menuOpen = false;
		if (locating) return;
		locating = true;
		try {
			await switchToCurrentLocation();
		} catch (error) {
			if (error instanceof LocationPermissionDeniedError) {
				toast.error(
					"Location permission denied. Change this in your system settings to use your current location.",
				);
			} else {
				console.error(error);
				showErrorToast({ label: "Failed to get current location", error });
			}
		} finally {
			locating = false;
		}
	}

	function openPicker() {
		menuOpen = false;
		// Center on the last mock pick, falling back to the current location.
		const geohash = getGeohashSnapshot() ?? getCurrentGeohashSnapshot();
		pinPos = geohash ? { ...decodeGeohash(geohash), zoom: 17 } : undefined;
		pickerOpen = true;
		if (pinPos) locationChooser?.centerAt(pinPos);
	}

	async function onSubmit(geohash: string) {
		try {
			await setPreferences({ geohash, usingCurrentLocation: false });
			pickerOpen = false;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to save location", error });
		}
	}
</script>

<DropdownMenu.Root bind:open={menuOpen}>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="secondary"
				aria-label="Change location"
				class={[
					"w-11",
					// Highlighted while a manually-picked (mock) location is in use.
					{ "bg-white text-popover hover:bg-neutral-200": !usingCurrent },
					className,
				]}
			>
				<MapPinIcon weight="fill" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-56">
		{#if geoSupported}
			<DropdownMenu.Item onclick={useCurrentLocation} disabled={locating}>
				<GpsFixIcon weight="fill" />
				Use current location
				{#if usingCurrent}
					<CheckIcon class="ms-auto" />
				{/if}
			</DropdownMenu.Item>
		{/if}
		<DropdownMenu.Item onclick={openPicker}>
			<MapPinIcon weight="fill" />
			Choose on map
			{#if !usingCurrent}
				<CheckIcon class="ms-auto" />
			{/if}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<LocationChooser
	{onSubmit}
	bind:open={pickerOpen}
	bind:this={locationChooser}
	bind:pinPos
/>
