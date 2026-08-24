<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import {
		addAccountInProgress,
		cancelAddAccount,
	} from "$lib/api/accounts.svelte";
	import { Button } from "$lib/components/ui/button";

	// Only shown when this sign-in was started from the account switcher: with no
	// other account signed in there is nothing to go back to, and offering it
	// would be a dead end.
	let adding = $state(false);
	let cancelling = $state(false);

	onMount(() => {
		void addAccountInProgress()
			.then((inProgress) => (adding = inProgress))
			.catch((error: unknown) => console.error(error));
	});

	async function cancel() {
		if (cancelling) return;
		cancelling = true;
		try {
			await cancelAddAccount();
		} catch (error) {
			console.error(error);
			toast.error("Could not go back to your account");
			cancelling = false;
		}
	}
</script>

{#if adding}
	<div
		class="mb-4 flex items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3"
	>
		<p class="min-w-0 text-caption text-muted-foreground">
			Adding another account. Your other accounts stay signed in.
		</p>
		<Button
			type="button"
			variant="ghost"
			size="sm"
			disabled={cancelling}
			onclick={cancel}
		>
			Cancel
		</Button>
	</div>
{/if}
