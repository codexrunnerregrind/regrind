<script lang="ts">
	import {
		CopyIcon,
		DotsThreeIcon,
		EyeSlashIcon,
		FlagIcon,
		MapPinIcon,
		ProhibitIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { hideUser } from "$lib/api/browse/hides";
	import { showErrorToast } from "$lib/api/error-toast";
	import BlockProfileDialog from "$lib/components/profile/BlockProfileDialog.svelte";
	import ReportSheet from "$lib/components/report/ReportSheet.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import {
		estimateProfileLocation,
		LocationUnavailableError,
	} from "$lib/location/trilaterate";
	import { openExternalLink } from "$lib/platform/link-opener";

	let {
		profileId,
		name = null,
		distance = null,
		blockable,
		onBlocked,
		onHidden,
	}: {
		profileId: number;
		name?: string | null;
		distance?: number | null;
		blockable: boolean;
		onBlocked: () => void;
		onHidden: () => void;
	} = $props();

	let submitting = $state(false);
	let locating = $state(false);
	let blockOpen = $state(false);
	let reportOpen = $state(false);

	// "View on map" is a hidden power-user tool. A normal tap opens the menu
	// without it; press-and-hold the dots button for this long to reveal it.
	// It hides again once the menu closes, so it never lingers after a plain tap.
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

	// Listeners go on the wrapper in the capture phase, added imperatively so the
	// trigger's own open behaviour is never touched and no handlers land on a
	// non-interactive element in markup.
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

<!-- The long-press detection lives on this wrapper (see the capture-phase
	listeners in the effect above) so it never alters the trigger's open behaviour. -->
<div class="contents" bind:this={triggerWrap}>
	<DropdownMenu.Root bind:open={menuOpen}>
		<DropdownMenu.Trigger>
			{#snippet child({ props: { class: className, ...props } })}
				<Button
					size="icon-lg"
					variant="secondary"
					aria-label="Profile menu"
					class={[className, "size-12"]}
					disabled={submitting || locating}
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
				disabled={submitting}
				onSelect={async () => {
					if (submitting) return;
					submitting = true;
					try {
						await hideUser({ profileId });
						onHidden();
					} catch (error) {
						console.error(error);
						showErrorToast({ label: "Failed to hide user", error });
					} finally {
						submitting = false;
					}
				}}
			>
				<EyeSlashIcon class="size-5" />
				Hide profile
			</DropdownMenu.Item>
			{#if blockable}
				<DropdownMenu.Item
					variant="destructive"
					onSelect={() => (blockOpen = true)}
				>
					<ProhibitIcon class="size-5" />
					Block profile
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

<BlockProfileDialog bind:open={blockOpen} {profileId} {name} {onBlocked} />
<ReportSheet bind:open={reportOpen} {profileId} {blockable} {onBlocked} />
