import type { AccountSummary } from "$lib/api/accounts.svelte";

/**
 * What to call an account.
 *
 * Its own profile name once that has been read, else how it signs in — never
 * the raw login field, which for a third-party sign-in holds an opaque vendor
 * id (`Q60CB36Z47`) that means nothing to the person reading it.
 */
export function accountTitle(account: AccountSummary): string {
	return (
		account.name ??
		account.email ??
		(account.google ? "Google account" : `Account ${account.profileId}`)
	);
}

/** How it signs in, dropped when the title is already saying it. */
export function accountLogin(account: AccountSummary): string | null {
	const shown = account.email ?? (account.google ? "Google account" : null);
	return shown === null || shown === accountTitle(account) ? null : shown;
}
