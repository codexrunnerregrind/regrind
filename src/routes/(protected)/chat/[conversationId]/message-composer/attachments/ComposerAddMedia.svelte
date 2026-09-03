<script lang="ts">
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import SealCheckIcon from "phosphor-svelte/lib/SealCheckIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import MediaCropper from "./MediaCropper.svelte";

	let {
		url,
		video,
		queued = 0,
		adding = false,
		onCancel,
		onConfirm,
	}: {
		/** Object URL for the picked file, once it has been read. */
		url: string | null;
		video: boolean;
		/** How many more picks are waiting behind this one. */
		queued?: number;
		adding?: boolean;
		onCancel: () => void;
		onConfirm: (edit: {
			blob: Blob | null;
			takenOnGrindr: boolean;
		}) => void;
	} = $props();

	let cropper = $state<{ render: () => Promise<Blob | null> } | null>(null);
	let takenOnGrindr = $state(false);
	let rendering = $state(false);

	// Nothing to add until the file is in hand.
	const busy = $derived(adding || rendering || url === null);

	async function confirm() {
		if (busy) return;
		rendering = true;
		try {
			// A clip has no editor here, and its re-encode happens natively on
			// the way out, so there is nothing to render.
			const blob = video ? null : ((await cropper?.render()) ?? null);
			onConfirm({ blob, takenOnGrindr });
		} catch (error) {
			console.error(error);
			onConfirm({ blob: null, takenOnGrindr });
		} finally {
			rendering = false;
		}
	}
</script>

<div class="flex flex-col gap-4 pb-2">
	<div class="flex items-center justify-between gap-3">
		<h2 class="text-base font-semibold">
			{video ? "Add video" : "Add photo"}
			{#if queued > 0}
				<span class="font-normal text-muted-foreground">
					({queued} more)
				</span>
			{/if}
		</h2>
		<!-- Backing out stays open while the file is still being read; only an
		     upload already in flight closes it. -->
		<Button
			variant="ghost"
			size="icon"
			aria-label="Cancel"
			disabled={adding}
			onclick={onCancel}
		>
			<XIcon class="size-5" />
		</Button>
	</div>

	{#if url === null}
		<!-- The panel opens on the pick and the file arrives behind it: reading a
		     clip off the camera roll takes seconds, and staring at a closed sheet
		     for them reads as the picker having failed. -->
		<div
			class="flex h-60 items-center justify-center rounded-xl bg-black/40"
		>
			<Spinner class="size-6 text-muted-foreground" />
		</div>
	{:else if video}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			src={url}
			controls
			playsinline
			preload="metadata"
			class="max-h-[45dvh] w-full rounded-xl bg-black object-contain"
		></video>
	{:else}
		<MediaCropper bind:this={cropper} src={url} watermark={takenOnGrindr} />
		<SwitchField
			title="Taken on Grindr watermark"
			description="Include the timestamp to certify the authenticity and recency of your photo"
			bind:checked={takenOnGrindr}
			disabled={busy}
		>
			{#snippet icon()}
				<SealCheckIcon weight="fill" class="size-4 text-primary" />
			{/snippet}
		</SwitchField>
	{/if}

	<!-- No Cancel beside it: backing out is the X in the header, which is where
	     the thumb already is for every other sheet in the app. -->
	<Button disabled={busy} onclick={() => void confirm()}>
		{#if busy}
			<Spinner class="size-4" />
		{:else}
			<PlusIcon weight="bold" />
		{/if}
		Add to drawer
	</Button>
</div>
