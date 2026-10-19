<script lang="ts">
	import SignOutIcon from "phosphor-svelte/lib/SignOutIcon";

	import { signOut } from "$lib/api/sign-out";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Spinner } from "$lib/components/ui/spinner";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	let alertOpen = $state(false);
	let signingOut = $state(false);

	const escapeKeydownBehavior = $derived(signingOut ? "ignore" : "close");

	dismissOnBackGesture({
		active: () => alertOpen,
		dismiss: () => {
			if (!signingOut) alertOpen = false;
		},
	});

	async function confirmSignOut() {
		signingOut = true;
		try {
			await signOut();
		} finally {
			signingOut = false;
			alertOpen = false;
		}
	}
</script>

<SettingsRow
	title="Sign Out"
	destructive
	chevron={false}
	onclick={() => (alertOpen = true)}
>
	{#snippet icon()}
		<SignOutIcon weight="fill" />
	{/snippet}
</SettingsRow>
<AlertDialog.Root bind:open={alertOpen}>
	<AlertDialog.Content {escapeKeydownBehavior}>
		<AlertDialog.Header>
			<AlertDialog.Title>Sign out?</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to sign out? You can sign back in at any
				time.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<fieldset disabled={signingOut} class="contents">
				<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
				<AlertDialog.Action
					onclick={() => void confirmSignOut()}
					size="lg"
					aria-busy={signingOut}
				>
					{#if signingOut}
						<Spinner aria-hidden="true" />
					{/if}
					Continue
				</AlertDialog.Action>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
