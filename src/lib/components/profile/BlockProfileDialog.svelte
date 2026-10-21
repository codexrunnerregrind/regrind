<script lang="ts">
	import { toast } from "svelte-sonner";

	import { blockUser } from "$lib/api/browse/blocks";
	import { showErrorToast } from "$lib/api/error-toast";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";

	let {
		open = $bindable(false),
		profileId,
		name = null,
		onBlocked,
		onConfirm,
	}: {
		open?: boolean;
		profileId: number;
		// Shown in the title when we know it, so it's clear who is being blocked.
		name?: string | null;
		onBlocked?: () => void;
		/** Takes over the block, e.g. to show it optimistically; the dialog just closes. */
		onConfirm?: () => void;
	} = $props();

	let blocking = $state(false);

	async function confirm() {
		if (blocking) return;
		if (onConfirm) {
			open = false;
			onConfirm();
			return;
		}
		blocking = true;
		try {
			await blockUser({ profileId });
			open = false;
			toast.success("User blocked");
			onBlocked?.();
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to block user", error });
		} finally {
			blocking = false;
		}
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{name ? `Block ${name}?` : "Block this user?"}
			</AlertDialog.Title>
			<AlertDialog.Description>
				They won't be able to see your profile or message you, and you
				won't see theirs. You can undo this from Account Settings.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={blocking}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				disabled={blocking}
				onclick={(event) => {
					// Kept open until the request lands, so the buttons can stay disabled
					// rather than the dialog vanishing on a block that then fails.
					event.preventDefault();
					void confirm();
				}}
			>
				{blocking ? "Blocking…" : "Block"}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
