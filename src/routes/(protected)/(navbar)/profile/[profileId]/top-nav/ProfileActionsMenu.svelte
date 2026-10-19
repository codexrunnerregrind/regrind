<script lang="ts">
	import CopyIcon from "phosphor-svelte/lib/CopyIcon";
	import DotsThreeIcon from "phosphor-svelte/lib/DotsThreeIcon";
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";
	import FlagIcon from "phosphor-svelte/lib/FlagIcon";
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";
	import ProhibitIcon from "phosphor-svelte/lib/ProhibitIcon";
	import { toast } from "svelte-sonner";

	import { blockUser } from "$lib/api/browse/blocks";
	import { hideUser } from "$lib/api/browse/hides";
	import { showErrorToast } from "$lib/api/error-toast";
	import BlockProfileDialog from "$lib/components/profile/BlockProfileDialog.svelte";
	import { showBlockFailure } from "$lib/components/report/block-failure";
	import ReportSheet from "$lib/components/report/ReportSheet.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import {
		estimateProfileLocation,
		LocationUnavailableError,
	} from "$lib/location/trilaterate";
	import { openExternalLink } from "$lib/platform/link-opener";
	import {
		applyViewabilityChange,
		type PendingViewabilityChange,
	} from "../profile-state.svelte";

	let {
		profileId,
		name = null,
		distance = null,
		changingViewability,
		markBlocked,
		markHidden,
	}: {
		profileId: number;
		name?: string | null;
		distance?: number | null;
		changingViewability: boolean;
		markBlocked: () => PendingViewabilityChange;
		markHidden: () => PendingViewabilityChange;
	} = $props();

	let locating = $state(false);
	let blockOpen = $state(false);
	let reportOpen = $state(false);

	function block() {
		void applyViewabilityChange({
			change: markBlocked,
			request: () => blockUser({ profileId }),
			showFailure: showBlockFailure,
		});
	}

	// "View on map" is a hidden power-user tool: press-and-hold the dots button
	// to reveal it. It hides again once the menu closes.
	const LONG_PRESS_MS = 500;
	let menuOpen = $state(false);
	let mapUnlocked = $state(false);
	let triggerWrap: HTMLElement | null = $state(null);
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	function startHold() {
		clearHold();
		holdTimer = setTimeout(() => (mapUnlocked = true), LONG_PRESS_MS);
	}

	function clearHold() {
		if (holdTimer !== null) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
	}

	$effect(() => {
		if (!menuOpen) mapUnlocked = false;
	});

	// Capture-phase listeners on the wrapper, so the trigger's own open
	// behaviour is untouched.
	$effect(() => {
		const el = triggerWrap;
		if (!el) return;
		el.addEventListener("pointerdown", startHold, true);
		el.addEventListener("pointerup", clearHold, true);
		el.addEventListener("pointerleave", clearHold, true);
		el.addEventListener("pointercancel", clearHold, true);
		return () => {
			clearHold();
			el.removeEventListener("pointerdown", startHold, true);
			el.removeEventListener("pointerup", clearHold, true);
			el.removeEventListener("pointerleave", clearHold, true);
			el.removeEventListener("pointercancel", clearHold, true);
		};
	});

	async function viewOnMap() {
		if (locating) return;
		locating = true;
		const pending = toast.loading("Pinpointing location…", {
			description: "Sampling distance from a few points.",
		});
		try {
			const { lat, lon, accuracyM } =
				await estimateProfileLocation(profileId);
			toast.success("Location estimated", {
				id: pending,
				description: `Opening map (±${Math.round(accuracyM)} m).`,
			});
			openExternalLink(
				`https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`,
			);
		} catch (error) {
			if (error instanceof LocationUnavailableError) {
				toast.error(error.message, { id: pending });
			} else {
				console.error(error);
				showErrorToast({ label: "Failed to locate user", error });
				toast.dismiss(pending);
			}
		} finally {
			locating = false;
		}
	}
</script>

<div class="contents" bind:this={triggerWrap}>
	<DropdownMenu.Root bind:open={menuOpen}>
		<DropdownMenu.Trigger disabled={changingViewability || locating}>
			{#snippet child({ props: { class: className, ...props } })}
				<Button
					size="icon-lg"
					variant="secondary"
					aria-label="Profile menu"
					class={[className, "size-12"]}
					{...props}
				>
					<DotsThreeIcon class="size-8" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content class="w-42" align="end">
			<DropdownMenu.Item
				onSelect={async () => {
					try {
						const clipboard =
							await import("@tauri-apps/plugin-clipboard-manager");
						await clipboard.writeText(String(profileId));
						toast.success("Profile ID copied to clipboard");
					} catch (error) {
						console.error(error);
						showErrorToast({
							label: "Failed to copy profile ID",
							error,
						});
					}
				}}
			>
				<CopyIcon class="size-5" />
				Copy profile ID
			</DropdownMenu.Item>
			{#if mapUnlocked && distance !== null}
				<DropdownMenu.Item disabled={locating} onSelect={viewOnMap}>
					<MapPinIcon class="size-5" />
					View on map
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Item onSelect={() => (reportOpen = true)}>
				<FlagIcon class="size-5" />
				Report profile
			</DropdownMenu.Item>
			<DropdownMenu.Item
				onSelect={() =>
					applyViewabilityChange({
						change: markHidden,
						request: () => hideUser({ profileId }),
						failureLabel: "Failed to hide user",
					})}
			>
				<EyeSlashIcon class="size-5" />
				Hide profile
			</DropdownMenu.Item>
			<DropdownMenu.Item
				variant="destructive"
				onSelect={() => (blockOpen = true)}
			>
				<ProhibitIcon class="size-5" />
				Block profile
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

<BlockProfileDialog
	bind:open={blockOpen}
	{profileId}
	{name}
	onConfirm={block}
/>
<ReportSheet bind:open={reportOpen} {profileId} onBlock={block} />
