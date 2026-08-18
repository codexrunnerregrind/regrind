<script lang="ts">
	import GpsFixIcon from "phosphor-svelte/lib/GpsFixIcon";
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		geoApiSupported as geoApiSupportedFn,
		LocationPermissionDeniedError,
		switchToCurrentLocation,
	} from "$lib/app-data/location";
	import { setPreferences } from "$lib/app-data/preferences.svelte";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";

	let geoMapPickerOpen = $state(false);

	const geoApiSupported = geoApiSupportedFn();
	let disabled = $state(false);

	async function handleDetectLocation() {
		disabled = true;
		try {
			await switchToCurrentLocation();
		} catch (error) {
			if (error instanceof LocationPermissionDeniedError) {
				toast.error(
					"Location permission denied. Change this in your system settings to use this button.",
				);
			} else {
				console.error(error);
				showErrorToast({
					label: "Failed to get current location",
					error,
				});
			}
		} finally {
			disabled = false;
		}
	}

	async function submitGeohash(geohash: string) {
		try {
			await setPreferences({ geohash, usingCurrentLocation: false });
			geoMapPickerOpen = false;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to save location", error });
		}
	}
</script>

<Empty.Root class="max-md:p-6">
	<Empty.Header>
		<Empty.Media variant="icon">
			<NavigationArrowIcon weight="fill" color="var(--primary)" />
		</Empty.Media>
		<Empty.Title>Choose location</Empty.Title>
		<Empty.Description>
			Pick a location on the map or select from the list to find nearby
			profiles.
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<div class="flex flex-wrap justify-center gap-2">
			{#if geoApiSupported}
				<Button
					variant="default"
					onclick={handleDetectLocation}
					{disabled}
				>
					<GpsFixIcon color="currentColor" weight="fill" />
					Use live location
				</Button>
			{/if}
			<Button
				variant={geoApiSupported ? "outline" : "default"}
				onclick={() => (geoMapPickerOpen = true)}
			>
				<MagnifyingGlassIcon color="currentColor" weight="fill" />
				Pick manually
			</Button>
		</div>
	</Empty.Content>
</Empty.Root>
<LocationChooser onSubmit={submitGeohash} bind:open={geoMapPickerOpen} />
