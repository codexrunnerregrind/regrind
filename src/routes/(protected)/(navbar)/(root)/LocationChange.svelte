<script lang="ts">
	import {
		CheckIcon,
		GpsFixIcon,
		ListIcon,
		MapPinIcon,
		StarIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
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
	import {
		getFavoriteLocations,
		getRecentLocations,
		touchSavedLocation,
	} from "$lib/app-data/saved-locations";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { decodeGeohash, encodeGeohash } from "$lib/model/geohash";
	import type { SavedLocation } from "$lib/model/saved-location";

	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();

	const usingCurrent = $derived(getUsingCurrentLocationSnapshot());
	const geoSupported = geoApiSupported();

	let menuOpen = $state(false);
	let pickerOpen = $state(false);
	let pinPos: { lat: number; lon: number; zoom: number } | undefined =
		$state();
	let locationChooser: LocationChooser | undefined = $state();
	let savedPlacesOpen = $state(false);
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
				showErrorToast({
					label: "Failed to get current location",
					error,
				});
			}
		} finally {
			locating = false;
		}
	}

	// Favorites first, then the freshest history entries. Only the top few make
	// the menu — the full, editable list lives in the map picker, one tap away
	// through "View all saved places".
	const savedPlaces = $derived([
		...getFavoriteLocations(),
		...getRecentLocations(),
	]);
	const quickPicks = $derived(savedPlaces.slice(0, 3));

	const activeGeohash = $derived(usingCurrent ? null : getGeohashSnapshot());

	function isActive(location: SavedLocation): boolean {
		return (
			activeGeohash ===
			encodeGeohash({ lat: location.lat, lon: location.lon })
		);
	}

	async function pickSaved(location: SavedLocation) {
		menuOpen = false;
		try {
			await setPreferences({
				geohash: encodeGeohash({
					lat: location.lat,
					lon: location.lon,
				}),
				usingCurrentLocation: false,
			});
			await touchSavedLocation(location.id);
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to save location", error });
		}
	}

	function openPicker({ showSavedPlaces = false } = {}) {
		menuOpen = false;
		savedPlacesOpen = showSavedPlaces;
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
					{
						"bg-foreground text-background hover:bg-foreground/90":
							!usingCurrent,
					},
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
				Use live location
				{#if usingCurrent}
					<CheckIcon class="ms-auto" />
				{/if}
			</DropdownMenu.Item>
		{/if}
		<DropdownMenu.Item onclick={() => openPicker()}>
			<MapPinIcon weight="fill" />
			Choose on map
			{#if !usingCurrent && quickPicks.every((pick) => !isActive(pick))}
				<CheckIcon class="ms-auto" />
			{/if}
		</DropdownMenu.Item>
		{#if savedPlaces.length > 0}
			<DropdownMenu.Separator />
			<DropdownMenu.Label>Saved places</DropdownMenu.Label>
			{#each quickPicks as location (location.id)}
				<DropdownMenu.Item onclick={() => void pickSaved(location)}>
					{#if location.favorite}
						<StarIcon weight="fill" class="text-yellow-500" />
					{:else}
						<MapPinIcon />
					{/if}
					<span class="truncate">{location.name}</span>
					{#if isActive(location)}
						<CheckIcon class="ms-auto shrink-0" />
					{/if}
				</DropdownMenu.Item>
			{/each}
			<DropdownMenu.Item
				onclick={() => openPicker({ showSavedPlaces: true })}
			>
				<ListIcon />
				View all saved places
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<LocationChooser
	{onSubmit}
	bind:savedPlacesOpen
	bind:open={pickerOpen}
	bind:this={locationChooser}
	bind:pinPos
/>
