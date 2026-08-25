<script lang="ts">
	import { PlusIcon, SpinnerGapIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { uploadProfilePhoto } from "$lib/api/users/profiles";
	import {
		pickMultipleMedia,
		readMediaBytes,
	} from "$lib/platform/media-picker";
	import ProfilePictureSlot from "./ProfilePictureSlot.svelte";

	const MAX_PHOTOS = 6;

	let { medias = $bindable() }: { medias: { mediaHash: string }[] } =
		$props();

	const emptySlots = $derived(
		Array.from(
			{ length: Math.max(0, MAX_PHOTOS - medias.length) },
			(_, index) => index,
		),
	);

	let uploading = $state(0);

	function removePhoto(mediaHash: string) {
		medias = medias.filter((media) => media.mediaHash !== mediaHash);
	}

	/**
	 * The photo reaches the CDN as soon as it is picked — that is the only way
	 * to get the hash the profile is saved with — but it is on the profile only
	 * once the form is saved, the same as a removal.
	 */
	async function addPhotos() {
		const room = MAX_PHOTOS - medias.length;
		if (uploading > 0 || room <= 0) return;
		const picked = (await pickMultipleMedia("image")).slice(0, room);
		if (picked.length === 0) return;

		uploading = picked.length;
		try {
			for (const media of picked) {
				const { mediaHash } = await uploadProfilePhoto({
					bytes: await readMediaBytes(media),
					contentType: media.mimeType ?? "image/jpeg",
				});
				if (
					!medias.some((existing) => existing.mediaHash === mediaHash)
				)
					medias = [...medias, { mediaHash }];
				uploading -= 1;
			}
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to upload photo", error });
		} finally {
			uploading = 0;
		}
	}
</script>

<div class="grid grid-cols-3 gap-2">
	{#each medias as media, i (media.mediaHash + i)}
		<ProfilePictureSlot
			mediaHash={media.mediaHash}
			position={i + 1}
			onDelete={() => removePhoto(media.mediaHash)}
		/>
	{/each}
	{#each emptySlots as slot (slot)}
		{#if slot === 0}
			<button
				type="button"
				class="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground disabled:opacity-50"
				disabled={uploading > 0}
				onclick={() => void addPhotos()}
				aria-label="Add profile photo"
			>
				{#if uploading > 0}
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
		The first photo is your profile picture. Photos are uploaded straight
		away and go on your profile when you save.
	</p>
{/if}
