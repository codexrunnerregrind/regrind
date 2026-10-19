<script lang="ts">
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import SealCheckIcon from "phosphor-svelte/lib/SealCheckIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import PhotoEditor from "$lib/components/media/PhotoEditor.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Spinner } from "$lib/components/ui/spinner";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
	import type { PhotoEditQueue } from "./photo-edit-queue.svelte";

	let {
		queue,
		title = "Add photo",
		confirmLabel = "Add",
		busy = false,
		nested = false,
		offerTakenOnGrindr = false,
	}: {
		queue: PhotoEditQueue;
		title?: string;
		confirmLabel?: string;
		/** Set while what was confirmed is being uploaded. */
		busy?: boolean;
		/** For an editor opened from inside another drawer. */
		nested?: boolean;
		/** Offers the Taken on Grindr stamp, which the confirmed photo carries
		 *  as `takenOnGrindr`. */
		offerTakenOnGrindr?: boolean;
	} = $props();

	const editing = $derived(queue.current);

	let editor = $state<{ render: () => Promise<Blob | null> } | null>(null);
	let rendering = $state(false);
	let takenOnGrindr = $state(false);

	const working = $derived(busy || rendering);

	// The queue is what holds the editor open, so backing out is a cancel and
	// never a plain close: the walk through the picks has to be told to stop.
	$effect(() => {
		if (editing === null) return;
		const onBackGesture = () => {
			if (!working) cancel();
			return false;
		};
		backGestureEventHandlers.set(onBackGesture, "overlay");
		return () => {
			backGestureEventHandlers.delete(onBackGesture);
		};
	});

	// Backing out ends the walk, so the stamp goes with it: the switch left on
	// for a pick that was never uploaded must not carry into the next batch.
	function cancel() {
		queue.cancel();
		takenOnGrindr = false;
	}

	async function confirm() {
		if (working) return;
		rendering = true;
		try {
			queue.confirm((await editor?.render()) ?? null, takenOnGrindr);
		} catch (error) {
			// The edit is what failed, not the pick: it goes up as it was taken.
			console.error(error);
			queue.confirm(null, takenOnGrindr);
		} finally {
			rendering = false;
			// The next pick in the walk starts unstamped, the same as it starts
			// from an untouched crop.
			takenOnGrindr = false;
		}
	}

	const Root = $derived(nested ? Drawer.NestedRoot : Drawer.Root);
</script>

<Root
	bind:open={
		() => editing !== null,
		(open) => {
			if (!open && !working) cancel();
		}
	}
>
	<Drawer.Content class="mx-auto max-w-160">
		<Drawer.Header class="flex-row items-center justify-between gap-3 pb-0">
			<Drawer.Title>
				{title}
				{#if editing !== null && editing.remaining > 0}
					<span class="font-normal text-muted-foreground">
						({editing.remaining} more)
					</span>
				{/if}
			</Drawer.Title>
			<Button
				variant="ghost"
				size="icon"
				aria-label="Cancel"
				disabled={working}
				onclick={cancel}
			>
				<XIcon class="size-5" />
			</Button>
		</Drawer.Header>

		<div class="flex flex-col gap-4 p-4">
			{#if editing !== null}
				<!-- Keyed on the pick: the next one starts from an untouched
				     crop, not from where the last one was left. -->
				{#key editing.key}
					<PhotoEditor
						bind:this={editor}
						src={editing.url}
						watermark={takenOnGrindr}
					/>
				{/key}
				{#if offerTakenOnGrindr}
					<SwitchField
						title="Taken on Grindr watermark"
						description="Include the timestamp to certify the authenticity and recency of your photo"
						bind:checked={takenOnGrindr}
						disabled={working}
					>
						{#snippet icon()}
							<SealCheckIcon
								weight="fill"
								class="size-4 text-primary"
							/>
						{/snippet}
					</SwitchField>
				{/if}
			{/if}

			<Button disabled={working} onclick={() => void confirm()}>
				{#if working}
					<Spinner class="size-4" />
				{:else}
					<CheckIcon weight="bold" />
				{/if}
				{confirmLabel}
			</Button>
		</div>
	</Drawer.Content>
</Root>
