<script lang="ts">
	import {
		checkPermissions,
		getCurrentPosition,
		requestPermissions,
	} from "@tauri-apps/plugin-geolocation";
	import { divIcon } from "leaflet";
	import { BookmarkSimpleIcon, GpsFixIcon, StarIcon } from "phosphor-svelte";
	import {
		ControlAttribution,
		ControlZoom,
		Map,
		Marker,
		TileLayer,
	} from "sveaflet";
	import { toast } from "svelte-sonner";
	import type {
		DragEndEvent,
		Map as LeafletMap,
		Marker as LeafletMarker,
		LeafletMouseEventHandlerFn,
	} from "leaflet";

	import { getPlaces } from "$lib/api/browse/location";
	import { showErrorToast } from "$lib/api/error-toast";
	import { getSavedLocationsSnapshot } from "$lib/app-data/preferences.svelte";
	import { rememberLocation } from "$lib/app-data/saved-locations";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import { Input } from "$lib/components/ui/input";
	import Spinner from "$lib/components/ui/spinner/spinner.svelte";
	import { spotKey } from "$lib/model/saved-location";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { openExternalLink } from "$lib/platform/link-opener";
	import { isMobilePlatform } from "$lib/platform/os";
	import SavedLocationsPanel from "./SavedLocationsPanel.svelte";

	let {
		pinPos = $bindable(),
		// eslint-disable-next-line no-useless-assignment -- $bindable() default
		atCurrentLocation = $bindable(false),
		pinLabel = $bindable(),
		savedPlacesOpen = $bindable(false),
	}: {
		pinPos?: { lat: number; lon: number };
		// True while the pin sits on the freshly-detected GPS position; reset by
		// any manual change (map tap, marker drag, place search).
		atCurrentLocation?: boolean;
		// Name of the searched place the pin came from, when it came from one.
		// Seeds the auto-derived name of a saved location; undefined for a pin
		// dropped by hand, which falls back to its coordinates.
		pinLabel?: string | undefined;
		// Whether the saved places list is showing; bindable so a caller can open
		// the picker directly onto it.
		savedPlacesOpen?: boolean;
	} = $props();

	let map: LeafletMap | undefined = $state();

	$effect(() => {
		const container = map?.getContainer();
		if (!container) return;
		const openExternally = (event: MouseEvent) => {
			if (event.target instanceof HTMLElement) {
				const href = event.target
					?.closest("a[href]")
					?.getAttribute("href");
				if (href) {
					event.preventDefault();
					openExternalLink(href);
				}
			}
		};
		container.addEventListener("click", openExternally);
		return () => container.removeEventListener("click", openExternally);
	});
	let gpsRequestInProgress = $state(false);

	$effect(() => {
		if (map) {
			const onMapClick: LeafletMouseEventHandlerFn = ({ latlng }) => {
				pinPos = { lat: latlng.lat, lon: latlng.lng };
				atCurrentLocation = false;
				pinLabel = undefined;
				map?.panTo(latlng);
			};
			map.on("click", onMapClick);
			return () => {
				map?.off("click", onMapClick);
			};
		}
	});

	// Leaflet measures its container on init; inside an animating drawer/dialog
	// that size is wrong, leaving tiles half-loaded. Re-measure on every resize.
	$effect(() => {
		if (!map) return;
		const observer = new ResizeObserver(() => map?.invalidateSize());
		observer.observe(map.getContainer());
		return () => observer.disconnect();
	});

	// Detects the device position, drops the pin on it and marks it as the
	// current location. `silent` suppresses the permission-denied toast (used for
	// automatic detection on open, vs. an explicit button press).
	export async function locate({ silent = false } = {}) {
		if (!gpsAvailable || gpsRequestInProgress) return;
		gpsRequestInProgress = true;
		try {
			let permissions = await checkPermissions();
			if (
				permissions.location === "prompt" ||
				permissions.location === "prompt-with-rationale"
			) {
				permissions = await requestPermissions(["location"]);
			}
			if (permissions.location !== "granted") {
				if (!silent) {
					toast.error(
						"Location permission denied. Change this in your system settings to use this button.",
					);
				}
				return;
			}
			const pos = await getCurrentPosition();
			const lat = pos.coords.latitude;
			const lon = pos.coords.longitude;
			pinPos = { lat, lon };
			atCurrentLocation = true;
			pinLabel = undefined;
			centerAt({ lat, lon, zoom: Math.max(map?.getZoom() ?? 0, 16) });
		} catch (error) {
			console.error(error);
			if (!silent) {
				showErrorToast({
					label: "Failed to get current location",
					error,
				});
			}
		} finally {
			gpsRequestInProgress = false;
		}
	}

	let searchQuery = $state("");
	let showSearchResults = $state(false);
	let searchInput: HTMLInputElement | null = $state(null);

	function pickPlace(place: { lat: number; lon: number; name: string }) {
		pinPos = { lat: place.lat, lon: place.lon };
		atCurrentLocation = false;
		pinLabel = place.name;
		showSearchResults = false;
		centerAt({ lat: place.lat, lon: place.lon, zoom: 17 });
		// Dismiss the keyboard only once the pin has moved, so the drawer resizes
		// after the tap rather than in the middle of it.
		searchInput?.blur();
	}
	const searchPlaces = $derived.by(async () => {
		const query = searchQuery.trim();
		if (!query) return;
		const response = await getPlaces({ query });
		return response;
	});

	let pendingCenter: { lat: number; lon: number; zoom: number } | undefined =
		$state();
	export function centerAt({
		lat,
		lon,
		zoom,
	}: {
		lat: number;
		lon: number;
		zoom: number;
	}) {
		if (!map) {
			pendingCenter = { lat, lon, zoom };
		} else {
			map.setView([lat, lon], zoom);
		}
	}

	$effect(() => {
		if (pendingCenter && map) {
			map.setView(
				[pendingCenter.lat, pendingCenter.lon],
				pendingCenter.zoom,
			);
			pendingCenter = undefined;
		}
	});

	let editingSavedId: string | undefined = $state();
	let savingPin = $state(false);

	let keyboardPrimer: HTMLInputElement | null = $state(null);

	/**
	 * iOS only raises the keyboard for a `focus()` that happens in the same task
	 * as the tap that caused it. Saving a pin has to await the store write first,
	 * so by the time the rename field mounts and focuses, the gesture is gone and
	 * the caret sits in a field with no keyboard under it. Focusing this offscreen
	 * field synchronously on the tap opens the keyboard up front; the rename field
	 * then inherits it, since moving focus between fields keeps it open.
	 */
	function primeKeyboard() {
		if (!isMobilePlatform()) return;
		keyboardPrimer?.focus();
	}

	// The saved entry the pin currently sits on, if any — drives the star's
	// filled state and lets a second tap jump straight to renaming it.
	const savedAtPin = $derived.by(() => {
		if (!pinPos) return undefined;
		const key = spotKey(pinPos);
		return getSavedLocationsSnapshot().find(
			(location) => spotKey(location) === key,
		);
	});

	async function saveCurrentPin() {
		if (!pinPos || savingPin) return;
		savingPin = true;
		try {
			const id = await rememberLocation({
				lat: pinPos.lat,
				lon: pinPos.lon,
				label: pinLabel,
				favorite: true,
			});
			// Open the list on the new row so the auto-derived name can be fixed
			// right away.
			editingSavedId = id;
			savedPlacesOpen = true;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to save location", error });
		} finally {
			savingPin = false;
		}
	}

	dismissOnBackGesture({
		active: () => savedPlacesOpen,
		dismiss: () => {
			savedPlacesOpen = false;
		},
	});

	dismissOnBackGesture({
		active: () => showSearchResults,
		dismiss: () => {
			showSearchResults = false;
		},
	});

	const gpsAvailable = isMobilePlatform();

	let pickerRoot: HTMLElement | null = $state(null);

	// Focusing a field makes iOS scroll whichever ancestor it deems scrollable so
	// the caret clears the keyboard. The picker's chrome — search bar, saved
	// places header — is positioned inside the visible area already, so that
	// scroll only serves to drag it off the top of the screen. Undo it.
	$effect(() => {
		const root = pickerRoot;
		if (!root) return;
		const settle = () => {
			requestAnimationFrame(() => {
				for (
					let element = root.parentElement;
					element;
					element = element.parentElement
				) {
					if (element.scrollTop) element.scrollTop = 0;
				}
				window.scrollTo(0, 0);
			});
		};
		root.addEventListener("focusin", settle);
		return () => root.removeEventListener("focusin", settle);
	});
</script>

<div bind:this={pickerRoot} class="relative h-[inherit] w-[inherit]">
	<!-- Keyboard primer: see primeKeyboard(). Kept out of the a11y tree and the
	tab order — it is never typed into, only focused for a few milliseconds. -->
	<input
		bind:this={keyboardPrimer}
		aria-hidden="true"
		tabindex="-1"
		class="pointer-events-none absolute top-0 left-0 size-px opacity-0"
	/>
	<Map
		options={{
			center: [40.42267869390329, -3.697633348267032],
			zoom: 2,
			attributionControl: false,
			// Leaflet's own zoom buttons default to the top-left, straight under
			// the search bar; re-added below in a free corner instead.
			zoomControl: false,
		}}
		bind:instance={map}
	>
		<TileLayer
			url={"https://tile.openstreetmap.org/{z}/{x}/{y}.png"}
			options={{
				maxZoom: 19,
				attribution:
					'&copy; <a href="http://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer nofollow noopener">OpenStreetMap</a> &nbsp;',
				// do not enable: https://github.com/Leaflet/Leaflet/issues/6195
				// detectRetina: true,
			}}
		/>
		<ControlAttribution options={{ prefix: undefined }} />
		<ControlZoom options={{ position: "bottomleft" }} />

		{#if pinPos}
			<Marker
				latLng={[pinPos.lat, pinPos.lon]}
				ondragend={(event: DragEndEvent) => {
					const { lat, lng } = (
						event.target as LeafletMarker
					).getLatLng();
					pinPos = { lat, lon: lng };
					atCurrentLocation = false;
					pinLabel = undefined;
				}}
				options={{
					draggable: true,
					title: "Selected location",
					icon: divIcon({
						html: '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="40" height="40" fill="#ffba20" stroke="#000000" stroke-width="8px" viewBox="0 0 256 256"><path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z"></path></svg>',
						iconAnchor: [20, 40],
						iconSize: [40, 40],
						className: "",
					}),
				}}
			/>
		{/if}
	</Map>
	<!-- Anchored to the top: the software keyboard rises from the bottom, and on
	iOS it either covers the lower half or scrolls it out of the webview, so a
	search bar down there hides exactly what is being typed. -->
	<div class="absolute top-2 right-2 left-2 z-1010">
		<Input
			bind:ref={searchInput}
			id="search-place"
			type="search"
			placeholder="Search places..."
			bind:value={
				() => searchQuery,
				(v: string) => {
					searchQuery = v;
					showSearchResults = v.length > 0;
				}
			}
			class="border-black/10 bg-white text-black shadow-md"
			maxlength={100}
			onfocus={() => {
				if (searchQuery.trim()) {
					showSearchResults = true;
				}
			}}
			onblur={() => {
				setTimeout(() => {
					showSearchResults = false;
				}, 200);
			}}
		/>
	</div>
	{#if showSearchResults}
		<!-- Hangs off the search bar rather than filling the map, so results stay
		next to the query instead of behind the keyboard. -->
		<div
			class="absolute top-14 right-2 left-2 z-1000 max-h-[calc(100%-4.5rem)]"
		>
			<div
				class="flex max-h-full w-full flex-col gap-2 overflow-auto rounded-md bg-white px-1 py-3 text-black shadow-md"
			>
				{#await searchPlaces}
					<Spinner class="mx-auto my-4 size-8" />
				{:then response}
					{#if response && response.places.length === 0}
						<p class="px-3 py-2 text-sm text-black/50">
							No places found.
						</p>
					{/if}
					{#if response}
						{#each response.places.toSorted((a, b) => b.importance - a.importance) as place (`${place.lat},${place.lon},${place.name}`)}
							<Button
								class="flex h-auto cursor-pointer flex-col items-start justify-start gap-0 text-left text-current"
								variant="link"
								onpointerdown={(event: PointerEvent) => {
									// Acting on pointerdown, not click: the tap
									// blurs the search field first, and the
									// closing keyboard resizes the drawer, so
									// the row slides out from under the finger
									// before any click is dispatched. Suppressing
									// the default keeps focus put until the pin
									// has moved.
									event.preventDefault();
									pickPlace(place);
								}}
								onclick={() => pickPlace(place)}
							>
								<span
									class="line-clamp-1 block max-w-full truncate"
								>
									{place.name}
								</span>
								<span
									class="line-clamp-1 block max-w-full truncate text-sm text-black/40"
								>
									{place.address}
								</span>
							</Button>
						{/each}
					{/if}
				{:catch error}
					<ApiErrorDisplay
						{error}
						buttonVariant="secondary"
						class="m-auto"
					/>
				{/await}
			</div>
		</div>
	{/if}
	<div class="absolute right-2 bottom-6 z-1010 flex flex-col gap-2">
		{#if pinPos}
			<Button
				size="icon-lg"
				aria-label={savedAtPin
					? "Rename this saved place"
					: "Save this place"}
				variant="default"
				class={[
					"cursor-pointer bg-white shadow-sm hover:bg-neutral-100",
					{
						"text-yellow-500": savedAtPin,
						"text-black": !savedAtPin,
					},
				]}
				disabled={savingPin}
				onclick={() => {
					primeKeyboard();
					if (savedAtPin) {
						editingSavedId = savedAtPin.id;
						savedPlacesOpen = true;
					} else {
						void saveCurrentPin();
					}
				}}
			>
				<StarIcon
					weight={savedAtPin ? "fill" : "regular"}
					class="size-6"
				/>
			</Button>
		{/if}
		<Button
			size="icon-lg"
			aria-label="Saved places"
			variant="default"
			class="cursor-pointer bg-white text-black shadow-sm hover:bg-neutral-100"
			onclick={() => {
				editingSavedId = undefined;
				savedPlacesOpen = !savedPlacesOpen;
				showSearchResults = false;
			}}
		>
			<BookmarkSimpleIcon weight="fill" class="size-6" />
		</Button>
		{#if gpsAvailable}
			<Button
				size="icon-lg"
				aria-label="Locate me"
				variant="default"
				class="cursor-pointer bg-white text-black shadow-sm hover:bg-neutral-100"
				disabled={gpsRequestInProgress}
				onclick={() => void locate()}
			>
				<GpsFixIcon weight="fill" class="size-6" />
			</Button>
		{/if}
	</div>
	{#if savedPlacesOpen}
		<SavedLocationsPanel
			bind:editing={editingSavedId}
			onClose={() => (savedPlacesOpen = false)}
			onPick={(location) => {
				pinPos = { lat: location.lat, lon: location.lon };
				pinLabel = location.name;
				atCurrentLocation = false;
				centerAt({ lat: location.lat, lon: location.lon, zoom: 17 });
				savedPlacesOpen = false;
			}}
		/>
	{/if}
</div>
