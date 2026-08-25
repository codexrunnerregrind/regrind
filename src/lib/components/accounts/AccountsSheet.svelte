<script lang="ts">
	import { goto } from "$app/navigation";
	import { PlusIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import {
		accountsState,
		type AccountSummary,
		addAccount,
		removeAccount,
		switchAccount,
		watchAccounts,
	} from "$lib/api/accounts.svelte";
	import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
	import { accountLogin, accountTitle } from "./labels";

	let { open = $bindable() }: { open: boolean } = $props();

	/** Manage reveals the per-account actions; off by default so the common
	 *  case — tapping another account to use it — stays one tap. */
	let managing = $state(false);
	let busy = $state(false);
	let confirmingSignOut = $state<AccountSummary | null>(null);

	const accounts = $derived(accountsState.accounts);
	const alone = $derived(accounts.length < 2);

	$effect(watchAccounts);

	$effect(() => {
		if (!open) return;
		void accountsState.reload();
		const onBackGesture = () => {
			open = false;
			return false;
		};
		backGestureEventHandlers.add(onBackGesture);
		return () => {
			backGestureEventHandlers.delete(onBackGesture);
		};
	});

	// A single account has nothing to manage, and the sheet closing should not
	// leave the mode latched on for next time.
	$effect(() => {
		if (!open || alone) managing = false;
	});

	/**
	 * Whether the account in use is actually advertising itself. Every other
	 * account is disconnected, so only this one can be online at all — and it
	 * is not, if it has been told to stay hidden.
	 */
	const activeIsOnline = $derived(getPreferencesSnapshot().stayOnline);

	function status(account: AccountSummary): string {
		if (!account.active) return "Offline";
		return activeIsOnline ? "In use · online" : "In use · hidden";
	}

	function detail(account: AccountSummary): string {
		const login = accountLogin(account);
		return login === null
			? status(account)
			: `${status(account)} · ${login}`;
	}

	async function run(work: () => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await work();
		} catch (error) {
			console.error(error);
			toast.error("Could not change accounts");
		} finally {
			busy = false;
		}
	}

	function use(account: AccountSummary) {
		void run(async () => {
			await switchAccount(account.profileId);
			open = false;
		});
	}

	function editProfile() {
		open = false;
		void goto("/settings/profile");
	}

	function signOut(account: AccountSummary) {
		confirmingSignOut = null;
		void run(async () => {
			await removeAccount(account.profileId);
			open = false;
		});
	}
</script>

<Drawer.Root bind:open>
	<Drawer.Content
		preventOverflowTextSelection={false}
		class="mx-auto max-w-160"
	>
		<Drawer.Header class="flex flex-row items-center justify-between">
			<Drawer.Title>{alone ? "Your account" : "Accounts"}</Drawer.Title>
			{#if !alone}
				<Button
					variant="link"
					size="sm"
					class="px-0"
					onclick={() => (managing = !managing)}
				>
					{managing ? "Done" : "Manage"}
				</Button>
			{/if}
		</Drawer.Header>

		<div class="flex flex-col gap-2 px-4 pb-2">
			{#each accounts as account (account.profileId)}
				{@const expanded = account.active && (alone || managing)}
				<div
					class={[
						"rounded-xl border bg-card transition-colors",
						{
							"border-primary": account.active,
							"border-border": !account.active,
						},
					]}
				>
					<div class="flex items-center gap-3.5 px-3.5 py-3">
						<span
							class="size-10 shrink-0 overflow-hidden rounded-full bg-media-placeholder"
						>
							<!-- Fetched on the *active* account's session, so a
							     background account's face costs it nothing and
							     leaves it offline. -->
							<UserAvatar
								mediaHash={account.avatar ?? null}
								class="size-full *:rounded-full"
							/>
						</span>
						<span class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span
								class="truncate font-heading text-row leading-snug font-medium"
							>
								{accountTitle(account)}
							</span>
							<span
								class="flex min-w-0 items-center gap-1.5 text-caption leading-snug text-muted-foreground"
							>
								<span
									class={[
										"size-1.5 shrink-0 rounded-full",
										{
											"bg-online":
												account.active &&
												activeIsOnline,
											"bg-muted-foreground/50": !(
												account.active && activeIsOnline
											),
										},
									]}
								></span>
								<span class="truncate">{detail(account)}</span>
							</span>
						</span>
						{#if account.active}
							{#if !alone && !managing}
								<span
									class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
									aria-label="In use"
								>
									<svg
										viewBox="0 0 16 16"
										class="size-3.5"
										aria-hidden="true"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M3.5 8.5l3 3 6-6" />
									</svg>
								</span>
							{/if}
						{:else if managing}
							<Button
								variant="ghost"
								size="sm"
								class="shrink-0 text-destructive"
								disabled={busy}
								onclick={() => (confirmingSignOut = account)}
							>
								Sign out
							</Button>
						{:else}
							<Button
								size="sm"
								class="shrink-0"
								disabled={busy}
								onclick={() => use(account)}
							>
								Use
							</Button>
						{/if}
					</div>

					{#if expanded}
						<div class="flex gap-2 px-3.5 pb-3.5">
							<Button
								variant="secondary"
								class="flex-1"
								disabled={busy}
								onclick={editProfile}
							>
								Edit profile
							</Button>
							<Button
								variant="secondary"
								class="flex-1 text-destructive"
								disabled={busy}
								onclick={() => (confirmingSignOut = account)}
							>
								Sign out
							</Button>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<p class="px-4 pb-3 text-caption leading-snug text-muted-foreground">
			{#if alone}
				Add a second account to switch between profiles without signing
				out.
			{:else if accounts.length === 2}
				Only the account in use is online. The other stays signed in but
				disconnected.
			{:else}
				Only the account in use is online. The others stay signed in but
				disconnected.
			{/if}
		</p>

		<div class="px-4 pb-4">
			<button
				type="button"
				disabled={busy}
				onclick={() => void run(addAccount)}
				class="flex min-h-14 w-full items-center gap-3.5 rounded-xl border border-border bg-card px-3.5 py-3 text-start transition-colors active:bg-muted disabled:opacity-55 can-hover:hover:bg-muted"
			>
				<span
					class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"
				>
					<PlusIcon weight="bold" class="size-4.5" />
				</span>
				<span
					class="truncate font-heading text-row leading-snug font-medium"
				>
					Add another account
				</span>
			</button>
		</div>
	</Drawer.Content>
</Drawer.Root>

{#if confirmingSignOut !== null}
	{@const account = confirmingSignOut}
	<Drawer.Root
		open
		onOpenChange={(next) => {
			if (!next) confirmingSignOut = null;
		}}
	>
		<Drawer.Content class="mx-auto max-w-160">
			<Drawer.Header>
				<Drawer.Title>Sign out?</Drawer.Title>
				<Drawer.Description>
					{accountTitle(account)} will be signed out and forgotten on this
					device.
					{accounts.length > 1
						? "Your other accounts stay signed in."
						: ""}
				</Drawer.Description>
			</Drawer.Header>
			<div class="flex flex-col gap-2 px-4 pb-4">
				<Button
					variant="destructive"
					size="lg"
					onclick={() => signOut(account)}
				>
					Sign out
				</Button>
				<Button
					variant="secondary"
					size="lg"
					onclick={() => (confirmingSignOut = null)}
				>
					Cancel
				</Button>
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
