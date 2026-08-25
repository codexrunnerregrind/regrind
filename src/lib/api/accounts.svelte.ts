import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { goto, invalidateAll } from "$app/navigation";

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	type AccountSummary,
	accountSummarySchema,
	callMethod,
} from "$lib/api/methods";
import { getProfile } from "$lib/api/users/profiles";
import {
	clearAccountPreferences,
	usePreferencesForAccount,
} from "$lib/app-data/preferences.svelte";
import { inboxLastViewed } from "$lib/chat/inbox-last-viewed.svelte";
import { tapsLastViewed } from "$lib/interest/taps-last-viewed";

export type { AccountSummary };

/**
 * The signed-in accounts, for the switcher.
 *
 * Held in one place because the list is drawn in more than one spot and every
 * one of them has to agree on which account is active; the backend emits
 * `accounts:changed` whenever it does, and this reloads on it.
 */
class AccountsState {
	accounts = $state<AccountSummary[]>([]);
	loading = $state(false);
	#loaded = false;

	get active(): AccountSummary | null {
		return this.accounts.find((account) => account.active) ?? null;
	}

	get others(): AccountSummary[] {
		return this.accounts.filter((account) => !account.active);
	}

	async load(): Promise<void> {
		if (this.#loaded) return;
		await this.reload();
	}

	async reload(): Promise<void> {
		this.loading = true;
		try {
			this.accounts = accountSummarySchema
				.array()
				.parse(await callMethod("accounts_list"));
			this.#loaded = true;
		} catch (error) {
			console.error("[accounts] could not list accounts", error);
		} finally {
			this.loading = false;
		}
	}
}

export const accountsState = new AccountsState();

/**
 * Keeps the list honest when the backend changes it on its own — an account
 * whose session turned out to be unusable is dropped at launch, and the
 * switcher must not go on offering it.
 */
export function watchAccounts(): () => void {
	if (!isTauri()) return () => {};
	const listener = listen("accounts:changed", () => {
		void accountsState.reload();
	});
	return () => {
		void listener.then((unlisten) => unlisten());
	};
}

/**
 * Everything the app holds for the account being left, dropped in the order the
 * next account needs it: the caches first, so nothing can read another
 * account's data, then the preferences the next account replaces.
 */
async function adoptAccount(profileId: number | null): Promise<void> {
	clearAccountCaches();
	await usePreferencesForAccount(profileId);
	await invalidateAll();
	if (profileId !== null) void reportAccountProfile(profileId);
}

/**
 * Switches to another signed-in account. The account left behind goes idle and
 * stops looking online within the presence window.
 */
export async function switchAccount(profileId: number): Promise<void> {
	if (accountsState.active?.profileId === profileId) return;
	await callMethod("account_switch", { profileId });
	await adoptAccount(profileId);
	await accountsState.reload();
	await goto("/", { replaceState: true });
}

/**
 * Starts a sign-in for an additional account. The accounts already signed in
 * are left in place and go idle until this one lands or is abandoned.
 */
export async function addAccount(): Promise<void> {
	await callMethod("account_add_begin");
	clearAccountCaches();
	await usePreferencesForAccount(null);
	await goto("/auth/sign-in");
}

/** Abandons an `addAccount` sign-in and returns to the account in use. */
export async function cancelAddAccount(): Promise<void> {
	await callMethod("account_add_cancel");
	await accountsState.reload();
	const restored = accountsState.active?.profileId ?? null;
	await adoptAccount(restored);
	await goto(restored === null ? "/auth/sign-in" : "/", {
		replaceState: true,
	});
}

export function addAccountInProgress(): Promise<boolean> {
	return callMethod("account_add_in_progress");
}

/**
 * Teaches the switcher what the active account looks like.
 *
 * The name and face come from the account's own profile, which is only loaded
 * for the account in use — so a newly added account gets them at once, and one
 * restored from an earlier launch fills them in the first time it is switched
 * to. Best-effort: a failure here costs a nicer label, nothing more.
 */
export async function reportAccountProfile(profileId: number): Promise<void> {
	try {
		const profile = await getProfile(profileId);
		await callMethod("account_set_profile", {
			profileId,
			name: profile.displayName ?? null,
			avatar: profile.medias[0]?.mediaHash ?? null,
		});
		await accountsState.reload();
	} catch (error) {
		console.error("[accounts] could not read the account's profile", error);
	}
}

/**
 * Settles the app onto an account that has just signed in.
 *
 * The backend has already filed the account by this point; this is the frontend
 * half — drop whatever the previous account left in memory, and read this
 * account's own preferences before any screen does.
 */
export async function accountSignedIn(profileId: number): Promise<void> {
	clearAccountCaches();
	await usePreferencesForAccount(profileId);
	await accountsState.reload();
	void reportAccountProfile(profileId);
}

/**
 * Signs one account out and forgets it. The other accounts are untouched, and
 * the app lands on whichever of them is active afterwards — or on sign-in when
 * that was the last one.
 */
export async function removeAccount(profileId: number): Promise<void> {
	let next: number | null = null;
	try {
		next = await callMethod("account_remove", { profileId });
	} catch (error) {
		console.error("[accounts] could not sign the account out", error);
	}

	for (const marker of [inboxLastViewed, tapsLastViewed])
		marker.clearStored(profileId);
	try {
		await clearAccountPreferences(profileId);
	} catch (error) {
		console.error(error);
	}

	await accountsState.reload();
	await adoptAccount(next);
	await goto(next === null ? "/auth/sign-in" : "/", { replaceState: true });
}
