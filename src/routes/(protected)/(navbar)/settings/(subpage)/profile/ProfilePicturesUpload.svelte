<script lang="ts">
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import SpinnerGapIcon from "phosphor-svelte/lib/SpinnerGapIcon";
	import { toast } from "svelte-sonner";

	import { httpStatusOf } from "$lib/api/api-error";
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		deleteProfilePhotos,
		getProfileUploadedPhotos,
		uploadProfilePhoto,
	} from "$lib/api/users/profiles";
	import PreviousUploadsSheet from "$lib/components/media-sheet/PreviousUploadsSheet.svelte";
	import { PhotoEditQueue } from "$lib/components/media/photo-edit-queue.svelte";
	import PhotoEditorDrawer from "$lib/components/media/PhotoEditorDrawer.svelte";
	import { demoEnabled } from "$lib/demo";
	import { discardStagedMedia } from "$lib/platform/media-file";
	import {
		receiveMedia,
		screenMedia,
	} from "$lib/platform/media-intake.svelte";
	import {
		type PickedMedia,
		pickMultipleMedia,
	} from "$lib/platform/media-picker";
	import { dragReorder } from "$lib/util/drag-reorder";
	import { profileMediaUrl } from "$lib/util/media";
	import { maxProfilePhotos as MAX_PHOTOS } from "./options";
	import ProfilePictureSlot from "./ProfilePictureSlot.svelte";

	const DAILY_LIMIT_MESSAGE =
		"You've reached today's limit for new profile photos";

	type PreviousUpload = { mediaHash: string };

	let {
		medias = $bindable(),
		ourProfileId,
	}: {
		medias: { mediaHash: string; takenOnGrindr: boolean }[];
		ourProfileId: number;
	} = $props();

	let sheetOpen = $state(false);

	const emptySlots = $derived(
		Array.from(
			{ length: Math.max(0, MAX_PHOTOS - medias.length) },
			(_, index) => index,
		),
	);

	let uploading = $state(false);
	const edits = new PhotoEditQueue();

	function removePhoto(mediaHash: string) {
		medias = medias.filter((media) => media.mediaHash !== mediaHash);
	}

	/**
	 * Reordering is what picks the profile picture: the photo held first is the
	 * one everyone else sees. The new order is saved with the rest of the form,
	 * so nothing here talks to the API.
	 */
	function movePhoto(from: number, to: number) {
		if (to < 0 || to >= medias.length || to === from) return;
		const next = [...medias];
		const [moved] = next.splice(from, 1);
		if (moved === undefined) return;
		next.splice(to, 0, moved);
		medias = next;
	}

	/**
	 * The photo reaches the CDN as soon as it is picked — that is the only way
	 * to get the hash the profile is saved with — but it is on the profile only
	 * once the form is saved, the same as a removal.
	 */
	async function addPhotos(received?: PickedMedia[]) {
		const room = MAX_PHOTOS - medias.length;
		if (uploading || room <= 0 || edits.current !== null) {
			if (received) void discardStagedMedia(received);
			return;
		}
		const all =
			received === undefined
				? await pickMultipleMedia("image")
				: (await screenMedia({ media: received, videos: false })).map(
						({ media }) => media,
					);
		const picked = all.slice(0, room);
		if (all.length > picked.length) {
			toast.error(
				`${all.length - picked.length} left out, a profile holds up to ${MAX_PHOTOS} photos`,
			);
			void discardStagedMedia(all.slice(room));
		}
		if (picked.length === 0) return;

		try {
			// Framed one at a time, and uploaded as each is confirmed rather
			// than in a batch at the end: the slot it fills appears with it.
			for await (const photo of edits.edit(picked)) {
				uploading = true;
				const { mediaHash } = await uploadProfilePhoto(photo);
				if (
					!medias.some((existing) => existing.mediaHash === mediaHash)
				)
					medias = [
						...medias,
						{ mediaHash, takenOnGrindr: photo.takenOnGrindr },
					];
				uploading = false;
			}
		} catch (error) {
			console.error(error);
			if (httpStatusOf(error) === 403) toast.error(DAILY_LIMIT_MESSAGE);
			else showErrorToast({ label: "Failed to upload photo", error });
		} finally {
			uploading = false;
		}
	}

	async function loadPreviousUploads(): Promise<PreviousUpload[]> {
		const { medias: uploaded } = await getProfileUploadedPhotos({
			selected: false,
		});
		const shown = new Set(medias.map(({ mediaHash }) => mediaHash));
		return uploaded.filter(({ mediaHash }) => !shown.has(mediaHash));
	}

	function addPreviousUploads(chosen: PreviousUpload[]): boolean {
		medias = [
			...medias,
			...chosen.map(({ mediaHash }) => ({
				mediaHash,
				takenOnGrindr: false,
			})),
		];
		return true;
	}

	receiveMedia(() =>
		medias.length < MAX_PHOTOS && !demoEnabled && !uploading
			? {
					label: "Drop to add photos",
					videos: false,
					receive: (media) => void addPhotos(media),
				}
			: null,
	);
</script>

<div
	class="reorder-grid grid grid-cols-3 gap-2"
	use:dragReorder={{
		enabled: medias.length > 1 && !uploading,
		onReorder: movePhoto,
	}}
>
	{#each medias as media, i (media.mediaHash + i)}
		<div data-reorder-item>
			<ProfilePictureSlot
				mediaHash={media.mediaHash}
				position={i + 1}
				takenOnGrindr={media.takenOnGrindr}
				onDelete={() => removePhoto(media.mediaHash)}
			/>
		</div>
	{/each}
	{#each emptySlots as slot (slot)}
		{#if slot === 0}
			<button
				type="button"
				class="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground disabled:opacity-50"
				disabled={uploading}
				onclick={() => (sheetOpen = true)}
				aria-label="Add profile photo"
			>
				{#if uploading}
					<SpinnerGapIcon class="size-6 animate-spin" />
				{:else}
					<PlusIcon class="size-6" />
				{/if}
			</button>
		{:else}
			<div
				class="aspect-square rounded-xl border border-dashed border-border"
				aria-hidden="true"
			></div>
		{/if}
	{/each}
</div>
{#if medias.length > 0}
	<p class="mt-2 text-2xs text-ink3">
		The first photo is your profile picture{medias.length > 1
			? " — hold a photo to move it"
			: ""}. Photos are uploaded straight away and go on your profile when
		you save.
	</p>
{/if}

<PreviousUploadsSheet
	bind:open={sheetOpen}
	uploadLabel="Upload photos"
	submitLabel="Add to profile"
	max={MAX_PHOTOS - medias.length}
	load={loadPreviousUploads}
	describe={({ mediaHash }) => ({
		key: mediaHash,
		src: profileMediaUrl({ mediaHash, size: "thumb" }),
		video: false,
	})}
	onUpload={() => void addPhotos()}
	onDelete={({ mediaHash }) =>
		deleteProfilePhotos({
			cacheProfileId: ourProfileId,
			mediaHashes: [mediaHash],
		})}
	onSubmit={addPreviousUploads}
/>

<PhotoEditorDrawer
	queue={edits}
	title="Add profile photo"
	confirmLabel="Upload"
	busy={uploading}
	offerTakenOnGrindr
/>
