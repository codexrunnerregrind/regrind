<script lang="ts">
	import { PlusCircleIcon, SignOutIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import {
		accountsState,
		type AccountSummary,
		addAccount,
		removeAccount,
		switchAccount,
		watchAccounts,
	} from "$lib/api/accounts.svelte";
	import SectionFooter from "$lib/components/settings/SectionFooter.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import AccountRow from "./AccountRow.svelte";

	// The list is loaded rather than awaited: the rows are the point of the
	// screen and there is nothing else to show while it arrives.
	void accountsState.load();
	$effect(watchAccounts);

	let busy = $state(false);
	let signingOut = $state<AccountSummary | null>(null);

	/**
	 * What to call an account. The name once its profile has been read, else how
	 * it signs in — never the raw login field, which for a third-party sign-in is
	 * an opaque vendor id that means nothing to the person reading it.
	 */
	function title(account: AccountSummary): string {
		return (
			account.name ??
			account.email ??
			(account.google ? "Google account" : `Account ${account.profileId}`)
		);
	}

	/** How it signs in, dropped when the title is already saying it. */
	function login(account: AccountSummary): string | null {
		const shown =
			account.email ?? (account.google ? "Google account" : null);
		return shown === null || shown === title(account) ? null : shown;
	}

	function status(account: AccountSummary): string {
		return account.active ? "in use" : "offline until you switch";
	}

	function detail(account: AccountSummary): string {
		const parts = [login(account), status(account)].filter(
			(part) => part !== null,
		);
		return parts.join(" · ");
	}

	async function run(work: () => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await work();
		} catch (error) {
			console.error(error);
			toast.error("Could not switch accounts");
		} finally {
			busy = false;
		}
	}
</script>

<SectionHeader>Signed in</SectionHeader>
<SettingsGroup divider="full">
	{#each accountsState.accounts as account (account.profileId)}
		<AccountRow
			{account}
			title={title(account)}
			detail={detail(account)}
			disabled={busy}
			onclick={account.active
				? undefined
				: () => void run(() => switchAccount(account.profileId))}
		/>
	{/each}
</SettingsGroup>
<SectionFooter>
	Only the account in use is online. The others hold their sign-in but stay
	disconnected, so nobody sees them online until you switch back.
</SectionFooter>

<SectionHeader>Add</SectionHeader>
<SettingsGroup>
	<SettingsRow
		title="Add another account"
		description="Signs in alongside the accounts above"
		disabled={busy}
		onclick={() => void run(addAccount)}
	>
		{#snippet icon()}
			<PlusCircleIcon weight="fill" />
		{/snippet}
	</SettingsRow>
</SettingsGroup>

{#if accountsState.accounts.length > 0}
	<div class="mt-5">
		<SettingsGroup divider="full">
			{#each accountsState.accounts as account (account.profileId)}
				<SettingsRow
					title="Sign out of {title(account)}"
					destructive
					chevron={false}
					disabled={busy}
					onclick={() => (signingOut = account)}
				>
					{#snippet icon()}
						<SignOutIcon weight="fill" />
					{/snippet}
				</SettingsRow>
			{/each}
		</SettingsGroup>
	</div>
{/if}

<AlertDialog.Root
	open={signingOut !== null}
	onOpenChange={(open) => {
		if (!open) signingOut = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Sign out?</AlertDialog.Title>
			<AlertDialog.Description>
				{signingOut === null ? "" : title(signingOut)} will be signed out
				and forgotten on this device. Your other accounts stay signed in.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				size="lg"
				onclick={() => {
					const account = signingOut;
					signingOut = null;
					if (account !== null)
						void run(() => removeAccount(account.profileId));
				}}
			>
				Sign out
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
