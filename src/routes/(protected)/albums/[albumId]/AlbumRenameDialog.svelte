<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import {
		ALBUM_NAME_MAX_BYTES,
		albumNameByteLength,
	} from "$lib/model/messaging/albums";

	let {
		open = $bindable(),
		value = $bindable(),
		busy,
		onSubmit,
	}: {
		open: boolean;
		value: string;
		busy: boolean;
		onSubmit: () => void;
	} = $props();

	const tooLong = $derived(albumNameByteLength(value) > ALBUM_NAME_MAX_BYTES);
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Rename album</Dialog.Title>
		</Dialog.Header>
		<Input bind:value placeholder="Album name" />
		{#if tooLong}
			<p class="text-sm text-destructive">
				Name is too long ({albumNameByteLength(
					value,
				)}/{ALBUM_NAME_MAX_BYTES}
				bytes).
			</p>
		{/if}
		<Dialog.Footer>
			<Button
				variant="outline"
				onclick={() => (open = false)}
				disabled={busy}
			>
				Cancel
			</Button>
			<Button onclick={onSubmit} disabled={busy || tooLong}>Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
